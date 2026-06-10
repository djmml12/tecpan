/**
 * Reporte de ventas por rango — formato carta (612×792pt, multi-página).
 *
 * Diseño: tipografía limpia, sin cajas de KPI con color.
 * Bloques: resumen en texto · gráfica de ventas por día · tabla de ventas.
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

export function buildSalesRangeLetterBuffer(summary, dailyData = [], stock = {}) {
  return new Promise((resolve, reject) => {
    try {
      const label = summary.from === summary.to
        ? fmt.date(summary.from)
        : `${fmt.date(summary.from)} — ${fmt.date(summary.to)}`;

      const { doc, addPage, finalize, contentY, contentBottom, contentW } =
        createLetterDoc("Reporte de Ventas", label);

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
        { label: "Ventas",          value: fmt.number(summary.sales.length) },
        { label: "Ticket promedio", value: fmt.currency(avgTicket) },
      ], mx, y, contentW, { columns: 2, lineH: 20 });

      y += LETTER.sectionGap;

      // ── Stock crítico ──────────────────────────────────────────────────
      const criticalList = stock.critical || [];
      const lowList      = stock.low      || [];

      if (criticalList.length) {
        const neededCrit = 30 + criticalList.length * LETTER.tableRowH;
        if (ensureSpace(y, neededCrit, contentBottom)) y = addPage();

        y = drawSectionTitle(doc, "Stock crítico", mx, y, contentW);

        const critCols = [
          { label: "Producto", width: contentW - 80 },
          { label: "Stock",    width: 80, align: "right" },
        ];
        y = drawTableHeader(doc, critCols, mx, y, 20);

        criticalList.forEach((p, i) => {
          if (ensureSpace(y, LETTER.tableRowH + 2, contentBottom)) {
            y = addPage();
            y = drawSectionTitle(doc, "Stock crítico (cont.)", mx, y, contentW);
            y = drawTableHeader(doc, critCols, mx, y, 20);
          }
          y = drawTableRow(
            doc, critCols,
            [p.name, String(p.stock)],
            mx, y, LETTER.tableRowH,
            { even: i % 2 === 1 },
          );
        });

        y += LETTER.sectionGap;
      }

      // ── Stock bajo ─────────────────────────────────────────────────────
      if (lowList.length) {
        const neededLow = 30 + lowList.length * LETTER.tableRowH;
        if (ensureSpace(y, neededLow, contentBottom)) y = addPage();

        y = drawSectionTitle(doc, "Stock bajo", mx, y, contentW);

        const lowCols = [
          { label: "Producto", width: contentW - 80 },
          { label: "Stock",    width: 80, align: "right" },
        ];
        y = drawTableHeader(doc, lowCols, mx, y, 20);

        lowList.forEach((p, i) => {
          if (ensureSpace(y, LETTER.tableRowH + 2, contentBottom)) {
            y = addPage();
            y = drawSectionTitle(doc, "Stock bajo (cont.)", mx, y, contentW);
            y = drawTableHeader(doc, lowCols, mx, y, 20);
          }
          y = drawTableRow(
            doc, lowCols,
            [p.name, String(p.stock)],
            mx, y, LETTER.tableRowH,
            { even: i % 2 === 1 },
          );
        });

        y += LETTER.sectionGap;
      }

      // ── Gráfica de ventas por día ───────────────────────────────────────
      if (dailyData.length > 1) {
        const chartH = 180;
        if (ensureSpace(y, chartH + 40, contentBottom)) {
          y = addPage();
        }

        y = drawSectionTitle(doc, "Ventas por día", mx, y, contentW);

        const maxDay = Math.max(...dailyData.map((d) => Number(d.total)), 1);
        const barItems = dailyData.map((d) => ({
          label: fmt.date(d.day).slice(0, 5),
          value: Math.round(Number(d.total)),
          color: C.orange,
        }));

        drawVBars(doc, mx, y, contentW, chartH, barItems, {
          maxVal:         maxDay,
          gridLines:      4,
          labelSize:      8,
          valueSize:      8,
          showValues:     true,
          showYAxis:      true,
          valueFormatter: (v) => `Q ${Math.round(v).toLocaleString("es-GT")}`,
          yAxisFormatter: (v) => `Q ${Math.round(v).toLocaleString("es-GT")}`,
        });

        y += chartH + LETTER.sectionGap;
      }

      // ── Tabla de ventas ─────────────────────────────────────────────────
      if (ensureSpace(y, 80, contentBottom)) {
        y = addPage();
      }

      y = drawSectionTitle(doc, "Detalle de ventas", mx, y, contentW);

      const cols = [
        { label: "#",            width: 50,  align: "center" },
        { label: "Fecha / Hora", width: 118 },
        { label: "Cajero",       width: 148 },
        { label: "Propina",      width: 80,  align: "right" },
        { label: "Total",        width: 60,  align: "right" },
        { label: "Cobrado",      width: 60,  align: "right" },
      ];
      const colsTotal = cols.reduce((s, c) => s + c.width, 0);
      if (colsTotal !== contentW) {
        cols[2].width += contentW - colsTotal;
      }

      y = drawTableHeader(doc, cols, mx, y, 20);

      if (!summary.sales.length) {
        const _sy = doc.y;
        doc.save()
           .fillColor(C.muted).font("Helvetica").fontSize(LETTER.bodySize)
           .text("No hay ventas en el rango seleccionado", mx, y + 6, {
             width: contentW, align: "center", lineBreak: false,
           })
           .restore();
        doc.y = _sy;
        y += 20;
      } else {
        summary.sales.forEach((sale, i) => {
          if (ensureSpace(y, LETTER.tableRowH + 2, contentBottom)) {
            y = addPage();
            y = drawSectionTitle(doc, "Detalle de ventas (cont.)", mx, y, contentW);
            y = drawTableHeader(doc, cols, mx, y, 20);
          }

          const total   = Number(sale.total || 0);
          const tip     = Number(sale.tip_amount || 0);
          const cobrado = total + tip;
          const fechaStr = fmt.datetime(sale.paid_at || sale.created_at);

          y = drawTableRow(
            doc, cols,
            [
              `#${sale.monthly_number ?? sale.id}`,
              fechaStr,
              sale.seller || "—",
              fmt.currency(tip),
              fmt.currency(total),
              fmt.currency(cobrado),
            ],
            mx, y, LETTER.tableRowH,
            { even: i % 2 === 1 }
          );
        });
      }

      // Fila de totales
      if (ensureSpace(y, LETTER.tableRowH + 6, contentBottom)) {
        y = addPage();
        y = drawTableHeader(doc, cols, mx, y, 20);
      }
      y += 2;
      drawTableRow(
        doc, cols,
        ["TOTAL", "", "",
         fmt.currency(summary.total_tips),
         fmt.currency(summary.total_sales_amount),
         fmt.currency(summary.total_collected)],
        mx, y, LETTER.tableRowH + 2,
        { bold: true }
      );
      y += LETTER.tableRowH + 14;

      const noteText = "Nota: las propinas son una cuenta aparte y no se incluyen en las utilidades del negocio.";
      if (!ensureSpace(y, 16, contentBottom)) {
        const _sy = doc.y;
        doc.save()
           .fillColor(C.muted).font("Helvetica").fontSize(LETTER.labelSize)
           .text(noteText, mx, y, { width: contentW, lineBreak: false })
           .restore();
        doc.y = _sy;
      }

      finalize();
    } catch (err) {
      reject(err);
    }
  });
}
