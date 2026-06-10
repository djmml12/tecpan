/**
 * Punto de entrada del módulo PDF.
 * Cada función reúne los datos necesarios y devuelve un Buffer.
 *
 * Las funciones buildXxx*Buffer son puras (datos → Buffer).
 * Las funciones generateXxx reúnen datos de servicios y llaman a los builders.
 */
import {
  getDailySalesSummaryService,
  getSalesReport,
  getSalesByHourService,
  getSalesByDayService,
  getInventoryDistributionService,
} from "../../services/reports.service.js";
import { getSaleByIdService } from "../../services/sales.service.js";
import db from "../../config/db.js";

import { buildDailySummaryMobileBuffer }  from "./reports/daily-summary-mobile.js";
import { buildDailySummaryLetterBuffer }  from "./reports/daily-summary-letter.js";
import { buildSalesRangeLetterBuffer }    from "./reports/sales-range-letter.js";
import { buildInventoryLetterBuffer }     from "./reports/inventory-letter.js";
import { buildBodegaLetterBuffer }        from "./reports/bodega-letter.js";
import { buildStockAlertMobileBuffer }    from "./reports/stock-alert-mobile.js";
import { buildReceiptLetterBuffer }       from "./reports/receipt-letter.js";

// ── Re-exports de builders puros ─────────────────────────────────────────────

export {
  buildDailySummaryMobileBuffer,
  buildDailySummaryLetterBuffer,
  buildSalesRangeLetterBuffer,
  buildInventoryLetterBuffer,
  buildBodegaLetterBuffer,
  buildStockAlertMobileBuffer,
  buildReceiptLetterBuffer,
};

// ── Helpers de inventario (usados por varios generadores) ─────────────────────

async function fetchInventoryRows() {
  const result = await db.query(`
    SELECT
      p.name,
      CASE WHEN parent.id IS NOT NULL THEN parent.name ELSE c.name END AS category,
      CASE WHEN parent.id IS NOT NULL THEN c.name ELSE '' END          AS subcategory,
      p.stock,
      p.cost_price,
      p.price,
      (p.stock * p.cost_price) AS inventory_value
    FROM products p
    LEFT JOIN categories c      ON c.id      = p.category_id
    LEFT JOIN categories parent ON parent.id = c.parent_id
    ORDER BY p.stock ASC, p.name ASC
  `);
  return result.rows ?? [];
}

async function fetchStockThresholds() {
  const result = await db.query(`SELECT value FROM settings WHERE key = 'stock_alert_thresholds'`);
  const row    = (result.rows ?? [])[0];
  if (!row?.value) return { criticalStock: 5, lowStock: 15 };
  try { return JSON.parse(row.value); } catch { return { criticalStock: 5, lowStock: 15 }; }
}

// ── Generadores completos ─────────────────────────────────────────────────────

/**
 * Resumen diario en formato móvil (para email).
 * @param {string} date  "YYYY-MM-DD"
 * @returns {Promise<Buffer>}
 */
export async function generateDailySummaryMobile(date) {
  const thresholds = await fetchStockThresholds();

  const stockResult = await db.query(`
    SELECT p.name, p.stock
    FROM products p
    WHERE p.is_active = 1 AND p.stock <= ?
    ORDER BY p.stock ASC, p.name ASC
  `, [thresholds.lowStock ?? 15]);

  const stockRows = (stockResult.rows ?? []).map((r) => ({
    name:  r.name,
    stock: Number(r.stock),
  }));

  const critical = stockRows.filter((r) => r.stock <= (thresholds.criticalStock ?? 5));
  const low      = stockRows.filter((r) => r.stock >  (thresholds.criticalStock ?? 5));

  const [summary, hourlyData] = await Promise.all([
    getDailySalesSummaryService(date),
    getSalesByHourService(date),
  ]);

  return buildDailySummaryMobileBuffer(summary, hourlyData, { critical, low, thresholds });
}

/**
 * Resumen diario en formato carta (para descarga).
 * @param {string} date
 * @returns {Promise<Buffer>}
 */
export async function generateDailySummaryLetter(date) {
  const [summary, hourlyData] = await Promise.all([
    getDailySalesSummaryService(date),
    getSalesByHourService(date),
  ]);
  return buildDailySummaryLetterBuffer(summary, hourlyData);
}

/**
 * Reporte de ventas por rango en formato carta.
 * @param {string} from  "YYYY-MM-DD"
 * @param {string} to    "YYYY-MM-DD"
 * @returns {Promise<Buffer>}
 */
export async function generateSalesRangeLetter(from, to) {
  const thresholds = await fetchStockThresholds();

  const [sales, dailyData, stockResult] = await Promise.all([
    getSalesReport(from, to),
    getSalesByDayService(from, to),
    db.query(`
      SELECT p.name, p.stock
      FROM products p
      WHERE p.is_active = 1 AND p.stock <= ?
      ORDER BY p.stock ASC, p.name ASC
    `, [thresholds.lowStock ?? 15]),
  ]);

  const stockRows = (stockResult.rows ?? []).map((r) => ({
    name:  r.name,
    stock: Number(r.stock),
  }));

  const critical = stockRows.filter((r) => r.stock <= (thresholds.criticalStock ?? 5));
  const low      = stockRows.filter((r) => r.stock >  (thresholds.criticalStock ?? 5));

  const total_sales_amount = sales.reduce((s, r) => s + Number(r.total || 0), 0);
  const total_tips         = sales.reduce((s, r) => s + Number(r.tip_amount || 0), 0);

  const summary = {
    from,
    to,
    sales,
    total_sales_amount,
    total_tips,
    total_collected: total_sales_amount + total_tips,
  };

  return buildSalesRangeLetterBuffer(summary, dailyData, { critical, low, thresholds });
}

/**
 * Reporte de inventario en formato carta.
 * @returns {Promise<Buffer>}
 */
export async function generateInventoryLetter() {
  const rows = await fetchInventoryRows();
  return buildInventoryLetterBuffer(rows);
}

/**
 * Reporte de bodega (insumos) en formato carta.
 * @returns {Promise<Buffer>}
 */
export async function generateBodegaLetter() {
  const result = await db.query(`
    SELECT nombre, unidad_base, stock_actual, stock_min, stock_critico, costo_unitario
    FROM insumos
    WHERE activo = 1
    ORDER BY stock_actual ASC, nombre ASC
  `);
  const rows = result.rows ?? [];
  return buildBodegaLetterBuffer(rows);
}

/**
 * Alerta de stock en formato móvil (para email).
 * @returns {Promise<Buffer>}
 */
export async function generateStockAlertMobile() {
  const thresholds = await fetchStockThresholds();

  const result = await db.query(`
    SELECT
      p.id,
      p.name,
      p.stock,
      CASE WHEN parent.id IS NOT NULL THEN parent.name ELSE c.name END AS category
    FROM products p
    LEFT JOIN categories c      ON c.id      = p.category_id
    LEFT JOIN categories parent ON parent.id = c.parent_id
    WHERE p.is_active = 1 AND p.stock <= ?
    ORDER BY p.stock ASC, p.name ASC
  `, [thresholds.lowStock]);

  const products = (result.rows ?? []).map((r) => ({
    id:       Number(r.id),
    name:     r.name,
    stock:    Number(r.stock),
    category: r.category || "Sin categoría",
  }));

  const data = {
    critical:   products.filter((p) => p.stock <= thresholds.criticalStock),
    low:        products.filter((p) => p.stock >  thresholds.criticalStock),
    thresholds,
  };

  return buildStockAlertMobileBuffer(data);
}

/**
 * Recibo de venta en formato carta.
 * @param {number} saleId
 * @returns {Promise<Buffer>}
 */
export async function generateReceiptLetter(saleId) {
  const sale = await getSaleByIdService(Number(saleId));
  if (!sale) throw new Error("Venta no encontrada");
  return buildReceiptLetterBuffer(sale);
}
