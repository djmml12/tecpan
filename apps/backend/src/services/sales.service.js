import db, { withTransaction } from "../config/db.js";
import { deductRecipeService } from "./bodega.service.js";
import { notifyStockChanged } from "../utils/stock-events.js";

// ── Result normalizers ────────────────────────────────────────────────────────
const assertValidUserId = (userId) => {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Sesion invalida. Inicia sesion nuevamente.");
  }
  return id;
};

const getRows = (result) => {
  if (Array.isArray(result)) return result;
  if (result?.rows && Array.isArray(result.rows)) return result.rows;
  return [];
};

const getFirstRow = (result) => getRows(result)[0] || null;

/** Redondeo a 2 decimales para moneda (GTQ). Evita drift de floating point. */
const money = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function scheduleStockAlertEvaluation(productIds = []) {
  if (!productIds.length) return;
  import("./email-alert.service.js")
    .then(({ evaluateStockAlertsForProducts }) => evaluateStockAlertsForProducts(productIds))
    .catch(err => console.error("[sales] Error al evaluar alertas de stock:", err.message));
}

// ── SQL fragments ─────────────────────────────────────────────────────────────

/** Next sequential number within the current calendar month */
const computeNextMonthlyNumber = async (qFn) => {
  const result = await qFn(
      `SELECT COALESCE(MAX(monthly_number), 0) + 1 AS next
       FROM sales
      WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')`,
    []
  );
  return Number(getRows(result)[0]?.next ?? 1);
};

// ── Internal queries ──────────────────────────────────────────────────────────

const SALE_HEADER_SQL = `
  SELECT
    s.id,
    s.monthly_number,
    s.reference,
    s.total,
    s.status,
    s.created_at,
    COALESCE(s.tip_amount, 0)     AS tip_amount,
    COALESCE(s.tip_percentage, 0) AS tip_percentage,
    s.notes,
    u.name AS user_name
  FROM sales s
  JOIN users u ON u.id = s.user_id
  WHERE s.id = ?
`;

const selectSaleHeaderById = async (saleId, client = null) => {
  const result = client
    ? await db.queryClient(client, SALE_HEADER_SQL, [saleId])
    : await db.query(SALE_HEADER_SQL, [saleId]);

  return getFirstRow(result);
};

const selectSaleItemsById = async (saleId, client = null) => {
  const sql = `
    SELECT
      si.id,
      si.product_id,
      p.name,
      p.category_id,
      COALESCE(c.printer_target, 'kitchen') AS printer_target,
      si.quantity,
      si.price_at_sale,
      si.notes
    FROM sale_items si
    JOIN products p ON p.id = si.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE si.sale_id = ?
  `;

  const result = client
    ? await db.queryClient(client, sql, [saleId])
    : await db.query(sql, [saleId]);

  return getRows(result);
};

// ── Public service functions ──────────────────────────────────────────────────

export async function createSaleService(userId, reference = null) {
  const safeUserId = assertValidUserId(userId);

  // monthly_number + INSERT en una transacción para que el número sea atómico.
  const { newId, monthlyNumber } = await withTransaction(async (client) => {
    const queryFn = (sql, params) => db.queryClient(client, sql, params);
    const monthlyNumber = await computeNextMonthlyNumber(queryFn);
    const result = await queryFn(
      `INSERT INTO sales (user_id, total, status, reference, monthly_number, created_at)
       VALUES (?, 0, 'open', ?, ?, datetime('now', 'localtime'))`,
      [safeUserId, reference, monthlyNumber]
    );
    return { newId: result.lastID, monthlyNumber };
  });

  return {
    ...(newId ? await selectSaleHeaderById(newId) : {}),
    id: newId,
    monthly_number: monthlyNumber,
    user_id: safeUserId,
    total: 0,
    status: "open",
    reference,
  };
}

export async function getOpenSalesService() {
  const result = await db.query(`
    SELECT id, monthly_number, reference, total, created_at
    FROM sales
    WHERE status = 'open'
    ORDER BY created_at DESC
  `);

  return getRows(result);
}

export async function getOpenSalesWithCountService() {
  const result = await db.query(`
    SELECT s.id, s.monthly_number, s.reference, s.total, s.created_at,
           CAST(COUNT(si.id) AS INTEGER) AS items_count
    FROM sales s
    LEFT JOIN sale_items si ON si.sale_id = s.id
    WHERE s.status = 'open'
    GROUP BY s.id, s.monthly_number, s.reference, s.total, s.created_at
    ORDER BY s.created_at DESC
  `);

  return getRows(result);
}

export async function createAndPaySaleService(userId, {
  items = [], order_id = null, reference = null,
  tip_amount = null, tip_percentage = null, client_request_id = null,
}) {
  const safeUserId = assertValidUserId(userId);
  if (!items.length) throw new Error("El carrito está vacío");

  const requestId = client_request_id ? String(client_request_id) : null;

  const sale = await withTransaction(async (client) => {
    const queryFn = (sql, params) => db.queryClient(client, sql, params);

    // Idempotencia: si este request ya generó una venta, devolverla sin recrear
    // (evita doble cobro cuando el cajero reintenta tras un timeout).
    if (requestId) {
      const dup = getRows(await queryFn(
        `SELECT id, total, tip_amount FROM sales WHERE client_request_id = ?`,
        [requestId]
      ))[0];
      if (dup) {
        return { id: dup.id, total: Number(dup.total), tip_amount: Number(dup.tip_amount ?? 0), duplicate: true };
      }
    }

    let saleId = order_id ? Number(order_id) : null;

    if (saleId) {
      const check = await queryFn(`SELECT status FROM sales WHERE id = ?`, [saleId]);
      const row = getRows(check)[0];
      if (!row) throw new Error("Orden no encontrada");
      if (row.status !== "open") throw new Error("La orden ya fue procesada");
      if (reference) {
        await queryFn(`UPDATE sales SET reference = ? WHERE id = ?`, [reference, saleId]);
      }
    } else {
      const monthlyNumber = await computeNextMonthlyNumber(queryFn);
      const result = await queryFn(
        `INSERT INTO sales (user_id, total, status, reference, monthly_number, created_at)
         VALUES (?, 0, 'open', ?, ?, datetime('now', 'localtime'))`,
        [safeUserId, reference, monthlyNumber]
      );
      saleId = result.lastID;
    }

    await queryFn(`DELETE FROM sale_items WHERE sale_id = ?`, [saleId]);

    let total = 0;
    for (const item of items) {
      const qty = Number(item.quantity ?? 0);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Cantidad inválida");

      const productResult = await queryFn(
        `SELECT id, name, price, cost_price, stock, COALESCE(tipo_stock,'directo') AS tipo_stock FROM products WHERE id = ? AND is_active = 1`,
        [item.product_id]
      );
      const product = getRows(productResult)[0];
      if (!product) throw new Error(`Producto ${item.product_id} no encontrado`);

      // El precio SIEMPRE viene de la DB, nunca del cliente (evita manipulación).
      const price    = Number(product.price);
      const cost     = Number(product.cost_price ?? 0);
      const subtotal = money(price * qty);
      total += subtotal;

      await queryFn(
        `INSERT INTO sale_items (sale_id, product_id, quantity, price_at_sale, cost_at_sale, subtotal)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [saleId, item.product_id, qty, price, cost, subtotal]
      );

      if (product.tipo_stock === "receta") {
        await deductRecipeService(item.product_id, qty, queryFn, saleId);
      } else {
        // Permitido a propósito: el stock puede quedar negativo cuando se vende
        // producto físico aún no cargado al sistema. El negativo refleja el faltante.
        await queryFn(`UPDATE products SET stock = stock - ? WHERE id = ?`, [qty, item.product_id]);
      }
    }
    total = money(total);

    // When neither tip_amount nor tip_percentage is explicitly provided,
    // apply the percentage configured in settings (same logic as paySaleWithTipService).
    // When explicitly set (including 0 for "Cobrar sin propina"), use the provided values.
    let finalTipAmount, finalTipPercentage;
    if (tip_amount === null && tip_percentage === null) {
      const tipResult = await queryFn(`SELECT value FROM settings WHERE key = 'tip_percentage'`, []);
      const tipRows   = getRows(tipResult);
      finalTipPercentage = Number(tipRows[0]?.value || 0);
      finalTipAmount     = money(total * finalTipPercentage / 100);
    } else {
      finalTipAmount     = tip_amount     !== null ? Number(tip_amount)     : 0;
      finalTipPercentage = tip_percentage !== null ? Number(tip_percentage) : 0;
    }

    await queryFn(
    `UPDATE sales
          SET total             = ?,
              status            = 'paid',
              paid_by           = ?,
              paid_at           = datetime('now', 'localtime'),
              tip_amount        = ?,
              tip_percentage    = ?,
              client_request_id = ?
        WHERE id = ?`,
      [total, safeUserId, finalTipAmount, finalTipPercentage, requestId, saleId]
    );

    return { id: saleId, total, tip_amount: finalTipAmount };
  });

  // Evaluar solo los productos vendidos — fire-and-forget, no bloquea la respuesta
  const productIds = items.map(i => Number(i.product_id)).filter(Boolean);
  if (productIds.length && !sale.duplicate) {
    notifyStockChanged({ full: true });
    scheduleStockAlertEvaluation(productIds);
  }

  return sale;
}

export async function createOpenOrderService(userId, { items = [], reference = null, notes = null }) {
  const safeUserId = assertValidUserId(userId);
  return withTransaction(async (client) => {
    const queryFn = (sql, params) => db.queryClient(client, sql, params);

    const monthlyNumber = await computeNextMonthlyNumber(queryFn);
    const insertResult = await queryFn(
      `INSERT INTO sales (user_id, total, status, reference, notes, monthly_number, created_at)
       VALUES (?, 0, 'open', ?, ?, ?, datetime('now', 'localtime'))`,
      [safeUserId, reference, notes, monthlyNumber]
    );
    const saleId = insertResult.lastID;

    let total = 0;
    for (const item of items) {
      const qty = Number(item.quantity ?? 0);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Cantidad inválida");

      const productResult = await queryFn(
        `SELECT id, price, cost_price FROM products WHERE id = ?`,
        [item.product_id]
      );
      const product = getRows(productResult)[0];
      if (!product) throw new Error(`Producto ${item.product_id} no encontrado`);

      // El precio SIEMPRE viene de la DB, nunca del cliente.
      const price    = Number(product.price);
      const cost     = Number(product.cost_price ?? 0);
      const subtotal = money(price * qty);
      total += subtotal;
      const itemNotes = item.notes ?? null;

      await queryFn(
        `INSERT INTO sale_items (sale_id, product_id, quantity, price_at_sale, cost_at_sale, subtotal, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [saleId, item.product_id, qty, price, cost, subtotal, itemNotes]
      );
    }
    total = money(total);

    await queryFn(`UPDATE sales SET total = ? WHERE id = ?`, [total, saleId]);

    return { id: saleId, monthly_number: monthlyNumber, reference, total, notes };
  });
}

export async function updateOpenOrderService(saleId, { items = [], reference, notes }) {
  return withTransaction(async (client) => {
    const queryFn = (sql, params) => db.queryClient(client, sql, params);

    const check = await queryFn(
      `SELECT status, reference, notes, monthly_number FROM sales WHERE id = ?`,
      [saleId]
    );
    const row = getRows(check)[0];
    if (!row) throw new Error("Orden no encontrada");
    if (row.status !== "open") throw new Error("Solo se pueden modificar órdenes abiertas");

    const newRef   = reference !== undefined ? reference : row.reference;
    const newNotes = notes     !== undefined ? notes     : row.notes;
    await queryFn(`UPDATE sales SET reference = ?, notes = ? WHERE id = ?`, [newRef, newNotes, saleId]);

    await queryFn(`DELETE FROM sale_items WHERE sale_id = ?`, [saleId]);

    let total = 0;
    for (const item of items) {
      const qty = Number(item.quantity ?? 0);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Cantidad inválida");

      const productResult = await queryFn(
        `SELECT id, price, cost_price FROM products WHERE id = ?`,
        [item.product_id]
      );
      const product = getRows(productResult)[0];
      if (!product) throw new Error(`Producto ${item.product_id} no encontrado`);

      // El precio SIEMPRE viene de la DB, nunca del cliente.
      const price    = Number(product.price);
      const cost     = Number(product.cost_price ?? 0);
      const subtotal = money(price * qty);
      total += subtotal;
      const itemNotes = item.notes ?? null;

      await queryFn(
        `INSERT INTO sale_items (sale_id, product_id, quantity, price_at_sale, cost_at_sale, subtotal, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [saleId, item.product_id, qty, price, cost, subtotal, itemNotes]
      );
    }
    total = money(total);

    await queryFn(`UPDATE sales SET total = ? WHERE id = ?`, [total, saleId]);

    return { id: saleId, monthly_number: Number(row.monthly_number ?? 0), reference: newRef, total, notes: newNotes };
  });
}

export async function getSaleByIdService(saleId) {
  const sale = await selectSaleHeaderById(saleId);

  if (!sale) {
    throw new Error("Orden no encontrada");
  }

  const items = await selectSaleItemsById(saleId);

  return {
    ...sale,
    items: items.map((item) => ({
      id:       item.product_id,
      name:     item.name,
      price:    Number(item.price_at_sale),
      quantity: item.quantity,
      notes:    item.notes,
    })),
  };
}

export async function updateSaleService(saleId, items, notes) {
  const normalizedItems = Array.isArray(items) ? items : [];

  return withTransaction(async (client) => {
    const queryFn = (sql, params) =>
      client ? db.queryClient(client, sql, params) : db.query(sql, params);

    const saleCheck = await queryFn(`SELECT status FROM sales WHERE id = ?`, [saleId]);
    const saleRows  = getRows(saleCheck);

    if (saleRows.length === 0) throw new Error("Orden no encontrada");
    if (saleRows[0].status !== "open") throw new Error("Solo se pueden modificar órdenes abiertas");

    if (notes !== undefined) {
      await queryFn(`UPDATE sales SET notes = ? WHERE id = ?`, [notes, saleId]);
    }

    await queryFn(`DELETE FROM sale_items WHERE sale_id = ?`, [saleId]);

    let total = 0;

    for (const item of normalizedItems) {
      const quantity = Number(item?.quantity ?? 0);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error("Cantidad inválida");
      }

      const productQuery = await queryFn(
        `SELECT id, price, cost_price FROM products WHERE id = ?`,
        [item.product_id]
      );
      const productRows = getRows(productQuery);

      if (productRows.length === 0) throw new Error("Producto no encontrado");

      const product  = productRows[0];
      const price    = Number(product.price);
      const cost     = Number(product.cost_price);
      const subtotal = money(price * quantity);
      const itemNotes = item?.notes ?? null;

      total += subtotal;

      await queryFn(
        `INSERT INTO sale_items (sale_id, product_id, quantity, price_at_sale, cost_at_sale, subtotal, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [saleId, item.product_id, quantity, price, cost, subtotal, itemNotes]
      );
    }
    total = money(total);

    await queryFn(`UPDATE sales SET total = ? WHERE id = ?`, [total, saleId]);

    return { id: saleId, total };
  });
}

async function processSaleItems(saleId, queryFn) {
  const items = await selectSaleItemsById(saleId);

  if (items.length === 0) {
    throw new Error("La orden no tiene productos");
  }

  let total = 0;

  for (const item of items) {
    const prodQuery = await queryFn(
      `SELECT stock, COALESCE(tipo_stock,'directo') AS tipo_stock FROM products WHERE id = ?`,
      [item.product_id]
    );
    const prodRows = getRows(prodQuery);
    if (prodRows.length === 0) throw new Error("Producto no encontrado");

    const qty = Number(item.quantity);
    const subtotal = money(Number(item.price_at_sale) * qty);
    total += subtotal;

    if (prodRows[0].tipo_stock === "receta") {
      await deductRecipeService(item.product_id, qty, queryFn, saleId);
    } else {
      // Stock negativo permitido (venta de producto aún no cargado al sistema).
      await queryFn(`UPDATE products SET stock = stock - ? WHERE id = ?`, [qty, item.product_id]);
    }
  }

  return money(total);
}

export async function paySaleService(saleId, userId) {
  const safeUserId = assertValidUserId(userId);
  const sale = await withTransaction(async (client) => {
    const queryFn = (sql, params) =>
      client ? db.queryClient(client, sql, params) : db.query(sql, params);

    const saleQuery = await queryFn(`SELECT status FROM sales WHERE id = ?`, [saleId]);
    const saleRows  = getRows(saleQuery);

    if (saleRows.length === 0) throw new Error("Orden no encontrada");
    if (saleRows[0].status !== "open") throw new Error("La orden ya fue procesada");

    const total = await processSaleItems(saleId, queryFn);

    await queryFn(
      `UPDATE sales
          SET total          = ?,
              status         = 'paid',
              paid_by        = ?,
              paid_at        = datetime('now', 'localtime'),
              tip_amount     = 0,
              tip_percentage = 0
        WHERE id = ?`,
      [total, safeUserId, saleId]
    );

    const updatedSale = await getSaleByIdService(saleId);
    return { ...updatedSale, total_with_tip: total };
  });

  // Evaluar solo los productos de esta venta
  const productIds = (sale.items ?? []).map(item => item.id);
  if (productIds.length) {
    notifyStockChanged({ full: true });
    scheduleStockAlertEvaluation(productIds);
  }

  return sale;
}

export async function paySaleWithTipService(saleId, userId) {
  const safeUserId = assertValidUserId(userId);
  const sale = await withTransaction(async (client) => {
    const queryFn = (sql, params) =>
      client ? db.queryClient(client, sql, params) : db.query(sql, params);

    const saleQuery = await queryFn(`SELECT status FROM sales WHERE id = ?`, [saleId]);
    const saleRows  = getRows(saleQuery);

    if (saleRows.length === 0) throw new Error("Orden no encontrada");
    if (saleRows[0].status !== "open") throw new Error("La orden ya fue procesada");

    const total = await processSaleItems(saleId, queryFn);

    const tipResult = await queryFn(`SELECT value FROM settings WHERE key = 'tip_percentage'`, []);
    const tipRows   = getRows(tipResult);
    const tipPercentage = Number(tipRows[0]?.value || 0);
    const tipAmount     = money(total * tipPercentage / 100);

    await queryFn(
      `UPDATE sales
          SET total          = ?,
              status         = 'paid',
              paid_by        = ?,
              paid_at        = datetime('now', 'localtime'),
              tip_amount     = ?,
              tip_percentage = ?
        WHERE id = ?`,
      [total, safeUserId, tipAmount, tipPercentage, saleId]
    );

    const updatedSale = await getSaleByIdService(saleId);
    return { ...updatedSale, total_with_tip: total + tipAmount };
  });

  // Evaluar solo los productos de esta venta
  const productIds = (sale.items ?? []).map(item => item.id);
  if (productIds.length) {
    notifyStockChanged({ full: true });
    scheduleStockAlertEvaluation(productIds);
  }

  return sale;
}

export async function getPaidSalesService(limit = 50) {
  const result = await db.query(
    `SELECT s.id,
            s.monthly_number,
            s.reference,
            s.total,
            s.tip_amount,
            s.created_at,
            COUNT(si.id) AS items_count
       FROM sales s
       LEFT JOIN sale_items si ON si.sale_id = s.id
      WHERE s.status = 'paid'
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT ?`,
    [limit]
  );
  return getRows(result);
}

export async function cancelSaleService(saleId, userId) {
  const safeUserId = assertValidUserId(userId);
  const result = await db.query(
    `UPDATE sales
        SET status      = 'canceled',
            canceled_at = datetime('now', 'localtime'),
            canceled_by = ?
      WHERE id     = ?
        AND status  = 'open'`,
    [safeUserId, saleId]
  );

  if ((result?.rowCount ?? 0) === 0) {
    throw new Error("La orden no existe o ya fue procesada");
  }

  const updatedSale = await getSaleByIdService(saleId);
  return { ...updatedSale, success: true };
}
