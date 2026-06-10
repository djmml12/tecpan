/**
 * Resumen diario — formato carta (612×792pt).
 * Diseño limpio: texto + gráficas legibles.
 */
import { C, LETTER, fmt } from "../theme.js";
import {
  createLetterDoc,
  drawTableHeader,
  drawTableRow,
  drawKpiText,
  drawSectionTitle,
  ensureSpace,
} from "../layout-letter.js";
import { drawVBars } from "../charts.js";

export function buildDailySummaryLetterBuffer(summary, hourlyData = []) {
  return new Promise((resolve, reject) => {
    try {
      const { doc, addPage, finalize, contentY, contentBottom, contentW } =
        createLetterDoc("Resumen del día", fmt.date(summary.date));

      const chunks = [];
      doc.on("data",  (c) => chunks.push(c));
      doc.on("end",   () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const mx = LETTER.marginX;
      let y    = addPage();

      // ── Resumen en texto ────────────────────────────────────────────────
      y = drawSectionTitle(doc, "Resumen", mx, y, contentW);

      const avgTicket = summary.sales.length
        ? summary.total_sales_amount / summary.sales.length
        : 0;

      y = drawKpiText(doc, [
        { label: "Total vendido",   value: fmt.currency(summary.total_sales_amount) },
        { label: "Propinas",        value: fmt.currency(summary.total_tips) },
        { label: "Total cobrado",   value: fmt.currency(summary.total_collected) },
        { label: "Utilidad",        value: fmt.currency(summary.total_profit) },
        { label: "Ventas",          value: fmt.number(summary.sales.length) },
        { label: "Ticket promedio", value: fmt.currency(avgTicket) },
      ], mx, y, contentW, { columns: 2, lineH: 20 });

      y += LETTER.sectionGap;

      // ── Ventas por hora ─────────────────────────────────────────────────
      const hoursWithSales = (hourlyData || []).filter((h) => Number(h.total) > 0);
      if (hoursWithSales.length) {
        const chartH = 170;
        if (ensureSpace(y, chartH + 40, contentBottom)) {
          y = addPage();
        }

        y = drawSectionTitle(doc, "Ventas por hora", mx, y, contentW);

        const maxVal   = Math.max(...hoursWithSales.map((h) => Number(h.total)), 1);
        const barItems = hoursWithSales.map((h) => ({
          label: `${String(h.hour).padStart(2, "0")}h`,
          value: Math.round(Number(h.total)),
          color: C.orange,
        }));

        drawVBars(doc, mx, y, contentW, chartH, barItems, {
          maxVal,
          gridLines:      4,
          labelSize:      8,
          valueSize:      7,
          showValues:     hoursWithSales.length <= 12,
          showYAxis:      true,
          valueFormatter: (v) => `Q ${Math.round(v).toLocaleString("es-GT")}`,
          yAxisFormatter: (v) => `Q ${Math.round(v).toLocaleString("es-GT")}`,
        });

        y += chartH + LETTER.sectionGap;
      }

      // ── Productos vendidos ──────────────────────────────────────────────
      const soldProducts = summary.sold_products || [];
      if (soldProducts.length) {
        if (ensureSpace(y, 60, contentBottom)) {
          y = addPage();
        }

        y = drawSectionTitle(doc, "Productos vendidos", mx, y, contentW);

        const prodCols = [
          { label: "Producto", width: contentW - 80, align: "left"  },
          { label: "Cant.",    width: 80,             align: "right" },
        ];

        y = drawTableHeader(doc, prodCols, mx, y, 20);

        soldProducts.forEach((p, i) => {
          if (ensureSpace(y, LETTER.tableRowH + 2, contentBottom)) {
            y = addPage();
            y = drawSectionTitle(doc, "Productos vendidos (cont.)", mx, y, contentW);
            y = drawTableHeader(doc, prodCols, mx, y, 20);
          }
          y = drawTableRow(doc, prodCols, [p.name, String(p.quantity)], mx, y, LETTER.tableRowH, { even: i % 2 === 1 });
        });

        y += LETTER.sectionGap;
      }

      // ── Tabla de ventas del día ────────────────────────────────────────
      if (ensureSpace(y, 80, contentBottom)) {
        y = addPage();
      }
      y = drawSectionTitle(doc, `Ventas pagadas (${summary.sales.length})`, mx, y, contentW);

      const hasTips = summary.total_tips > 0;
      const cols = hasTips
        ? [
            { label: "#",       width: 60,  align: "center" },
            { label: "Total",   width: 150, align: "right" },
            { label: "Propina", width: 150, align: "right" },
          ]
        : [
            { label: "#",       width: 80,  align: "center" },
            { label: "Total",   width: 220, align: "right" },
          ];
      const colsTotal = cols.reduce((s, c) => s + c.width, 0);
      cols[cols.length - 1].width += contentW - colsTotal;

      y = drawTableHeader(doc, cols, mx, y, 20);

      if (!summary.sales.length) {
        const _sy = doc.y;
        doc.save()
           .fillColor(C.muted).font("Helvetica").fontSize(LETTER.bodySize)
           .text("Sin ventas pagadas en esta fecha", mx, y + 6, {
             width: contentW, align: "center", lineBreak: false,
           })
           .restore();
        doc.y = _sy;
        y += 20;
      } else {
        summary.sales.forEach((sale, i) => {
          if (ensureSpace(y, LETTER.tableRowH + 2, contentBottom)) {
            y = addPage();
            y = drawSectionTitle(doc, "Ventas (cont.)", mx, y, contentW);
            y = drawTableHeader(doc, cols, mx, y, 20);
          }
          const vals = hasTips
            ? [`#${sale.monthly_number ?? sale.id}`, fmt.currency(sale.total), fmt.currency(sale.tip || 0)]
            : [`#${sale.monthly_number ?? sale.id}`, fmt.currency(sale.total)];
          y = drawTableRow(doc, cols, vals, mx, y, LETTER.tableRowH, { even: i % 2 === 1 });
        });

        if (ensureSpace(y, LETTER.tableRowH + 6, contentBottom)) {
          y = addPage();
          y = drawTableHeader(doc, cols, mx, y, 20);
        }
        y += 2;
        const totalVals = hasTips
          ? ["TOTAL", fmt.currency(summary.total_sales_amount), fmt.currency(summary.total_tips)]
          : ["TOTAL", fmt.currency(summary.total_sales_amount)];
        drawTableRow(doc, cols, totalVals, mx, y, LETTER.tableRowH + 2, { bold: true });
      }

      finalize();
    } catch (err) {
      reject(err);
    }
  });
}
