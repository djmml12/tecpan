import db from "../config/db.js";
import {
  getCashierRangeData,
  getDashboardSummaryService,
  getDailySalesSummaryService,
  getSalesReport,
  getInventoryMetricsService,
} from "../services/reports.service.js";
import { getSaleByIdService } from "../services/sales.service.js";
import { getEmailAlertConfigService } from "../services/email-alert.service.js";

// ── Lazy loaders para módulos pesados (no se cargan al iniciar el servidor) ────

let _nm;
const getNm = async () => { if (!_nm) _nm = (await import("nodemailer")).default; return _nm; };

let _pdf;
const getPdf = async () => { if (!_pdf) _pdf = await import("../utils/pdf/index.js"); return _pdf; };

// ── Helpers de fecha ──────────────────────────────────────────────────────────

const localSaleDateExpr        = `date(COALESCE(NULLIF(s.paid_at, ''), s.created_at))`;
const localSaleDateExprNoAlias = `date(COALESCE(NULLIF(paid_at, ''), created_at))`;
const localCanceledDateExpr    = `date(s.canceled_at)`;
const dateBetween              = (expr) => `${expr} BETWEEN date(?) AND date(?)`;

const todayString = () => {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day   = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// ── Email helpers ─────────────────────────────────────────────────────────────

const getMailTransport = async (config) => {
  const nodemailer = await getNm();
  return nodemailer.createTransport({
    host:              config.smtpHost,
    port:              Number(config.smtpPort || 587),
    secure:            Boolean(config.secureConnection),
    family:            4,
    connectionTimeout: 10_000,
    greetingTimeout:   10_000,
    socketTimeout:     15_000,
    tls:               { servername: config.smtpHost, rejectUnauthorized: true, minVersion: "TLSv1.2" },
    auth:              { user: config.smtpUser, pass: config.smtpPassword },
  });
};

const getMailRecipients = (config) => ({
  to: config.receiverEmail,
  cc: String(config.ccEmails || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean),
});


// ── Helper inventario ─────────────────────────────────────────────────────────

export const getInventoryRows = async () => {
  const result = await db.query(`
    SELECT
      p.name,
      CASE WHEN parent.id IS NOT NULL THEN parent.name ELSE c.name END AS category,
      CASE WHEN parent.id IS NOT NULL THEN c.name      ELSE ''        END AS subcategory,
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
};

// ── Excel helpers ─────────────────────────────────────────────────────────────

const buildSalesReportExcelBuffer = async (sales) => {
  const ExcelJS     = (await import("exceljs")).default;
  const workbook    = new ExcelJS.Workbook();
  const worksheet   = workbook.addWorksheet("Ventas");

  worksheet.columns = [
    { header: "Venta #",        key: "id",             width: 12 },
    { header: "Vendedor",       key: "seller",          width: 28 },
    { header: "Fecha",          key: "date",            width: 24 },
    { header: "Propina",        key: "tip_amount",      width: 14 },
    { header: "Total vendido",  key: "total",           width: 16 },
    { header: "Total cobrado",  key: "total_collected", width: 16 },
  ];
  worksheet.getRow(1).font = { bold: true };

  let totalVentas = 0, totalPropinas = 0;

  sales.forEach((sale) => {
    const total = Number(sale.total || 0);
    const tip   = Number(sale.tip_amount || 0);
    totalVentas   += total;
    totalPropinas += tip;
    worksheet.addRow({
      id: sale.id, seller: sale.seller || "N/A",
      date: sale.paid_at || sale.created_at || "",
      tip_amount: tip, total, total_collected: total + tip,
    });
  });

  const tr = worksheet.addRow({
    seller: "TOTAL", tip_amount: totalPropinas,
    total: totalVentas, total_collected: totalVentas + totalPropinas,
  });
  tr.font = { bold: true };

  const nr = worksheet.addRow({ seller: "* Las propinas son una cuenta aparte y no se incluyen en las utilidades." });
  nr.getCell("seller").font = { italic: true, color: { argb: "FF6B7280" } };

  ["tip_amount", "total", "total_collected"].forEach((k) => {
    worksheet.getColumn(k).numFmt = '"Q"#,##0.00';
  });

  return workbook.xlsx.writeBuffer();
};

const buildInventoryReportExcelBuffer = async (rows) => {
  const ExcelJS   = (await import("exceljs")).default;
  const workbook  = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Inventario");

  worksheet.columns = [
    { header: "Producto",         key: "name",            width: 30 },
    { header: "Categoría",        key: "category",        width: 20 },
    { header: "Subcategoría",     key: "subcategory",     width: 20 },
    { header: "Stock",            key: "stock",           width: 10 },
    { header: "Costo",            key: "cost_price",      width: 12 },
    { header: "Precio",           key: "price",           width: 12 },
    { header: "Valor Inventario", key: "inventory_value", width: 18 },
  ];
  worksheet.getRow(1).font = { bold: true };

  let totalStock = 0, totalValue = 0;

  rows.forEach((product) => {
    const stock = Number(product.stock || 0);
    const iv    = Number(product.inventory_value || 0);
    totalStock += stock;
    totalValue += iv;
    const row = worksheet.addRow({
      name:            product.name,
      category:        product.category,
      subcategory:     product.subcategory || "",
      stock,
      cost_price:      Number(product.cost_price || 0),
      price:           Number(product.price      || 0),
      inventory_value: iv,
    });
    if (stock <= 5)  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFCCCC" } };
    else if (stock <= 15) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
  });

  const tr = worksheet.addRow({ name: "TOTAL", stock: totalStock, inventory_value: totalValue });
  tr.font = { bold: true };

  return workbook.xlsx.writeBuffer();
};

// ── Controladores de reporte (datos JSON) ─────────────────────────────────────

export const getDailyReport = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        ${localSaleDateExprNoAlias} AS date,
        COUNT(*) AS total_sales,
        COALESCE(SUM(total), 0) AS total_sales_amount,
        COALESCE(SUM(tip_amount), 0) AS total_tips,
        COALESCE(SUM(total + tip_amount), 0) AS total_collected
      FROM sales
      WHERE status = 'paid'
      GROUP BY ${localSaleDateExprNoAlias}
      ORDER BY date DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("DAILY REPORT ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando reporte diario" });
  }
};

export const getCashierReport = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        COALESCE(u.id, 0) AS user_id,
        COALESCE(NULLIF(u.name, ''), u.username, 'Sin usuario') AS cashier,
        COUNT(s.id) AS total_sales,
        COALESCE(SUM(s.total), 0) AS total_sales_amount,
        COALESCE(SUM(s.tip_amount), 0) AS total_tips,
        COALESCE(SUM(s.total + s.tip_amount), 0) AS total_collected
      FROM sales s
      LEFT JOIN users u ON u.id = s.user_id
      WHERE s.status = 'paid'
      GROUP BY u.id, u.name
      ORDER BY total_collected DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("CASHIER REPORT ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando reporte por cajero" });
  }
};

export const getDailyCashierReport = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        ${localSaleDateExpr} AS date,
        COALESCE(u.id, 0) AS user_id,
        COALESCE(NULLIF(u.name, ''), u.username, 'Sin usuario') AS cashier,
        COUNT(s.id) AS total_sales,
        COALESCE(SUM(s.total), 0) AS total_sales_amount,
        COALESCE(SUM(s.tip_amount), 0) AS total_tips,
        COALESCE(SUM(s.total + s.tip_amount), 0) AS total_collected
      FROM sales s
      LEFT JOIN users u ON u.id = s.user_id
      WHERE s.status = 'paid'
      GROUP BY ${localSaleDateExpr}, u.id, u.name
      ORDER BY date DESC, total_collected DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("DAILY CASHIER REPORT ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando reporte diario por cajero" });
  }
};

export const getCashierRangeReport = async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ success: false, message: "from y to son obligatorios" });
    const data = await getCashierRangeData(from, to);
    res.json({ success: true, from, to, data });
  } catch (error) {
    console.error("RANGE REPORT ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando reporte por rango" });
  }
};

export const getCanceledSalesReport = async (req, res) => {
  try {
    const { from, to } = req.query;
    let sql    = `
      SELECT s.id, s.total, s.tip_amount, s.created_at, s.canceled_at,
             u1.name AS sold_by, u2.name AS canceled_by
      FROM sales s
      JOIN users u1  ON u1.id = s.user_id
      LEFT JOIN users u2 ON u2.id = s.canceled_by
      WHERE s.status = 'canceled'
    `;
    const params = [];
    if (from && to) {
      sql += ` AND ${dateBetween(localCanceledDateExpr)}`;
      params.push(from, to);
    }
    sql += ` ORDER BY s.canceled_at DESC`;
    const result = await db.query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("CANCELED REPORT ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando reporte de cancelaciones" });
  }
};

export const exportCashierRangeReport = async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ success: false, message: "from y to son obligatorios" });
    const data = await getCashierRangeData(from, to);
    const { exportToExcel } = await import("../utils/exportExcel.js");
    await exportToExcel(res, data, `reporte_${from}_a_${to}`);
  } catch (error) {
    console.error("EXPORT EXCEL ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando Excel" });
  }
};

export const getDashboardSummary = async (req, res) => {
  try {
    const from = req.query.from || todayString();
    const to   = req.query.to   || from;
    const data = await getDashboardSummaryService(from, to, req.query.user_id || null);
    res.json({ success: true, data });
  } catch (error) {
    console.error("DASHBOARD ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando dashboard" });
  }
};

export const salesReport = async (req, res) => {
  try {
    const from  = req.query.from || todayString();
    const to    = req.query.to   || from;
    const sales = await getSalesReport(from, to);
    res.json({ success: true, data: sales });
  } catch (error) {
    console.error("SALES REPORT ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando reporte" });
  }
};

export const getTodayLogoutSummary = async (req, res) => {
  try {
    const date = req.query.date || todayString();
    const data = await getDailySalesSummaryService(date);
    res.json({ success: true, data });
  } catch (error) {
    console.error("TODAY LOGOUT SUMMARY ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando resumen del dia" });
  }
};

// ── Envío de correos con PDF ──────────────────────────────────────────────────

export const sendTodayLogoutSummaryEmail = async (req, res) => {
  try {
    const date   = req.body?.date || req.query.date || todayString();
    const config = await getEmailAlertConfigService();

    if (!config.smtpHost || !config.smtpUser || !config.smtpPassword || !config.senderEmail || !config.receiverEmail) {
      return res.status(400).json({
        success: false,
        message: "Completa la configuracion SMTP y el correo destinatario para enviar el resumen",
      });
    }

    const [summary, pdfBuffer] = await Promise.all([
      getDailySalesSummaryService(date),
      getPdf().then(p => p.generateDailySummaryMobile(date)),
    ]);
    const transport  = await getMailTransport(config);
    const recipients = getMailRecipients(config);

    try {
      await transport.sendMail({
        from:        `"${config.senderName}" <${config.senderEmail}>`,
        to:          recipients.to,
        cc:          recipients.cc,
        subject:     `${config.subjectPrefix || "FÉNIX"} - Resumen del día ${summary.date}`,
        text:        `Resumen del día ${summary.date} adjunto en PDF.`,
        attachments: [{ filename: `resumen_${summary.date}.pdf`, content: pdfBuffer, contentType: "application/pdf" }],
      });
    } finally {
      try { transport.close(); } catch {}
    }

    res.json({ success: true, message: "Resumen enviado por correo", data: { date: summary.date } });
  } catch (error) {
    console.error("SEND LOGOUT SUMMARY EMAIL ERROR:", error);
    res.status(500).json({ success: false, message: error.message || "Error enviando resumen por correo" });
  }
};

export const sendSalesRangeReportEmail = async (req, res) => {
  try {
    const from   = req.body?.from || todayString();
    const to     = req.body?.to   || from;
    const format = String(req.body?.format || "pdf").toLowerCase();
    const label  = String(req.body?.label  || "ventas");
    const config = await getEmailAlertConfigService();

    if (!config.smtpHost || !config.smtpUser || !config.smtpPassword || !config.senderEmail || !config.receiverEmail) {
      return res.status(400).json({
        success: false,
        message: "Completa la configuracion SMTP y el correo destinatario para enviar el reporte",
      });
    }

    const sales      = await getSalesReport(from, to);
    const transport  = await getMailTransport(config);
    const recipients = getMailRecipients(config);
    const baseName   = `reporte_${label}_${from}_a_${to}`;

    let attachment;
    if (format === "excel") {
      attachment = {
        filename:    `${baseName}.xlsx`,
        content:     await buildSalesReportExcelBuffer(sales),
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    } else {
      attachment = {
        filename:    `${baseName}.pdf`,
        content:     await (await getPdf()).generateSalesRangeLetter(from, to),
        contentType: "application/pdf",
      };
    }

    try {
      await transport.sendMail({
        from:    `"${config.senderName}" <${config.senderEmail}>`,
        to:      recipients.to,
        cc:      recipients.cc,
        subject: `${config.subjectPrefix || "FÉNIX"} - Reporte ${label} ${from} a ${to}`,
        text:    `Adjunto reporte ${label} de ventas del rango ${from} a ${to} en formato ${format.toUpperCase()}.`,
        attachments: [attachment],
      });
    } finally {
      try { transport.close(); } catch {}
    }

    res.json({ success: true, message: "Reporte enviado por correo" });
  } catch (error) {
    console.error("SEND SALES RANGE REPORT EMAIL ERROR:", error);
    res.status(500).json({ success: false, message: error.message || "Error enviando reporte por correo" });
  }
};

export const sendInventoryReportEmail = async (req, res) => {
  try {
    const format = String(req.body?.format || "pdf").toLowerCase();
    const config = await getEmailAlertConfigService();

    if (!config.smtpHost || !config.smtpUser || !config.smtpPassword || !config.senderEmail || !config.receiverEmail) {
      return res.status(400).json({
        success: false,
        message: "Completa la configuracion SMTP y el correo destinatario para enviar el reporte",
      });
    }

    const rows       = await getInventoryRows();
    const transport  = await getMailTransport(config);
    const recipients = getMailRecipients(config);
    const baseName   = `reporte_inventario_${todayString()}`;

    let attachment;
    if (format === "pdf") {
      attachment = {
        filename:    `${baseName}.pdf`,
        content:     await (await getPdf()).generateInventoryLetter(),
        contentType: "application/pdf",
      };
    } else {
      attachment = {
        filename:    `${baseName}.xlsx`,
        content:     await buildInventoryReportExcelBuffer(rows),
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    }

    try {
      await transport.sendMail({
        from:    `"${config.senderName}" <${config.senderEmail}>`,
        to:      recipients.to,
        cc:      recipients.cc,
        subject: `${config.subjectPrefix || "FÉNIX"} - Reporte inventario ${todayString()}`,
        text:    `Adjunto reporte de inventario en formato ${format.toUpperCase()}.`,
        attachments: [attachment],
      });
    } finally {
      try { transport.close(); } catch {}
    }

    res.json({ success: true, message: "Reporte de inventario enviado por correo" });
  } catch (error) {
    console.error("SEND INVENTORY REPORT EMAIL ERROR:", error);
    res.status(500).json({ success: false, message: error.message || "Error enviando reporte de inventario por correo" });
  }
};

// ── Descarga de reportes PDF / Excel ─────────────────────────────────────────

export const exportSalesRangeReport = async (req, res) => {
  try {
    const from   = req.query.from   || todayString();
    const to     = req.query.to     || from;
    const format = String(req.query.format || "excel").toLowerCase();
    const label  = String(req.query.label  || "ventas");

    if (format === "pdf") {
      const filename        = `reporte_${label}_${from}_a_${to}.pdf`;
      const encodedFilename = encodeURIComponent(filename);
      const pdfBuffer       = await (await getPdf()).generateSalesRangeLetter(from, to);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition",
        `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`);
      res.end(pdfBuffer);
      return;
    }

    const sales       = await getSalesReport(from, to);
    const excelBuffer = await buildSalesReportExcelBuffer(sales);
    const filename    = `reporte_${label}_${from}_a_${to}.xlsx`;
    const encodedFilename = encodeURIComponent(filename);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition",
      `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`);
    res.end(excelBuffer);
  } catch (error) {
    console.error("EXPORT SALES REPORT ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando reporte de ventas" });
  }
};

export const getTodayCashierReport = async (req, res) => {
  try {
    const today = todayString();
    const data  = await getCashierRangeData(today, today);
    res.json({ success: true, data });
  } catch (error) {
    console.error("TODAY CASHIER ERROR:", error);
    res.status(500).json({ success: false, message: "Error al obtener la caja de hoy por cajero" });
  }
};

export const getInventoryReport = async (req, res) => {
  try {
    const rows = await getInventoryRows();
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("INVENTORY REPORT ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando reporte de inventario" });
  }
};

export const exportInventoryExcel = async (req, res) => {
  try {
    const rows    = await getInventoryRows();
    const buffer  = await buildInventoryReportExcelBuffer(rows);
    const filename = `reporte_inventario_${todayString()}.xlsx`;
    const encodedFilename = encodeURIComponent(filename);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition",
      `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`);
    res.end(buffer);
  } catch (error) {
    console.error("INVENTORY EXCEL ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando Excel inventario" });
  }
};

export const exportInventoryReport = async (req, res) => {
  try {
    const format = String(req.query.format || "excel").toLowerCase();

    if (format === "pdf") {
      const filename        = `reporte_inventario_${todayString()}.pdf`;
      const encodedFilename = encodeURIComponent(filename);
      const pdfBuffer       = await (await getPdf()).generateInventoryLetter();

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition",
        `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`);
      res.end(pdfBuffer);
      return;
    }

    return exportInventoryExcel(req, res);
  } catch (error) {
    console.error("INVENTORY REPORT EXPORT ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando reporte de inventario" });
  }
};

export const generateSaleReceiptPdf = async (req, res) => {
  try {
    const saleId    = Number(req.params.id);
    const pdfBuffer = await (await getPdf()).generateReceiptLetter(saleId);

    if (!pdfBuffer) {
      return res.status(404).send("Venta no encontrada");
    }

    const sale = await getSaleByIdService(saleId);
    const filename = `recibo_${sale?.monthly_number ?? saleId}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.end(pdfBuffer);
  } catch (error) {
    if (error.message === "Venta no encontrada") {
      return res.status(404).send("Venta no encontrada");
    }
    console.error("RECEIPT PDF ERROR:", error);
    res.status(500).send("Error generando recibo");
  }
};

export const getInventoryMetrics = async (req, res) => {
  try {
    const data = await getInventoryMetricsService();
    res.json({ success: true, data });
  } catch (error) {
    console.error("INVENTORY METRICS ERROR:", error);
    res.status(500).json({ success: false, message: "Error obteniendo métricas de inventario" });
  }
};

// ── Bodega (insumos) ──────────────────────────────────────────────────────────

const getBodegaRows = async () => {
  const result = await db.query(`
    SELECT nombre, unidad_base, stock_actual, stock_min, stock_critico, costo_unitario
    FROM insumos
    WHERE activo = 1
    ORDER BY stock_actual ASC, nombre ASC
  `);
  return result.rows ?? [];
};

const buildBodegaReportExcelBuffer = async (rows) => {
  const ExcelJS   = (await import("exceljs")).default;
  const workbook  = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Bodega");

  worksheet.columns = [
    { header: "Insumo",        key: "nombre",        width: 32 },
    { header: "Unidad",        key: "unidad_base",   width: 12 },
    { header: "Stock actual",  key: "stock_actual",  width: 14 },
    { header: "Stock mínimo",  key: "stock_min",     width: 14 },
    { header: "Stock crítico", key: "stock_critico", width: 14 },
    { header: "Costo unitario",key: "costo_unitario",width: 16 },
  ];
  worksheet.getRow(1).font = { bold: true };

  rows.forEach((row) => {
    const stock    = Number(row.stock_actual  || 0);
    const critical = Number(row.stock_critico || 0);
    const min      = Number(row.stock_min     || 0);
    const r = worksheet.addRow({
      nombre:         row.nombre,
      unidad_base:    row.unidad_base,
      stock_actual:   stock,
      stock_min:      min,
      stock_critico:  critical,
      costo_unitario: Number(row.costo_unitario || 0),
    });
    if (critical > 0 && stock <= critical)      r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFCCCC" } };
    else if (min > 0 && stock <= min)           r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
  });

  worksheet.getColumn("costo_unitario").numFmt = '"Q"#,##0.00';

  return workbook.xlsx.writeBuffer();
};

export const getBodegaReport = async (req, res) => {
  try {
    const rows = await getBodegaRows();
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("BODEGA REPORT ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando reporte de bodega" });
  }
};

export const exportBodegaReport = async (req, res) => {
  try {
    const format = String(req.query.format || "excel").toLowerCase();

    if (format === "pdf") {
      const filename        = `reporte_bodega_${todayString()}.pdf`;
      const encodedFilename = encodeURIComponent(filename);
      const pdfBuffer       = await (await getPdf()).generateBodegaLetter();

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition",
        `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`);
      res.end(pdfBuffer);
      return;
    }

    const rows    = await getBodegaRows();
    const buffer  = await buildBodegaReportExcelBuffer(rows);
    const filename = `reporte_bodega_${todayString()}.xlsx`;
    const encodedFilename = encodeURIComponent(filename);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition",
      `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`);
    res.end(buffer);
  } catch (error) {
    console.error("BODEGA REPORT EXPORT ERROR:", error);
    res.status(500).json({ success: false, message: "Error generando reporte de bodega" });
  }
};
