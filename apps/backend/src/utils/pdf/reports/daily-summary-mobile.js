import PDFDocument from "pdfkit";
import { C, fmt } from "../theme.js";

const W  = 420;
const PX = 20;
const CW = W - PX * 2; // 380

const fmtQ = (n) => {
  const val = Number(n || 0);
  const [int, dec] = val.toFixed(2).split(".");
  return `Q ${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${dec}`;
};

function calcHeight(summary, hoursWithSales, stock = {}) {
  const hasTips    = summary.total_tips > 0;
  const kpiCount   = 5 + (hasTips ? 1 : 0);
  const salesCount = summary.sales.length;
  const critical   = (stock.critical || []).length;
  const low        = (stock.low      || []).length;

  let h = 42 + 16;                              // header + gap
  h += 22 + kpiCount * 24 + 14;                // resumen section
  if (critical) h += 22 + critical * 20 + 14;  // stock crítico
  if (low)      h += 22 + low      * 20 + 14;  // stock bajo
  if (hoursWithSales.length) h += 22 + hoursWithSales.length * 22 + 14;
  if ((summary.sold_products || []).length) h += 22 + summary.sold_products.length * 20 + 14;
  h += 22;                                      // sales section title
  h += salesCount === 0 ? 30 : 18 + salesCount * 28 + 26;
  h += 30;                                      // footer DLAB
  return Math.max(h, 400);
}

function sectionTitle(doc, text, y) {
  doc.save().rect(PX, y, CW, 20).fill(C.orangeMuted).restore();
  doc.save().rect(PX, y, 3, 20).fill(C.orange).restore();
  doc.save()
     .fillColor(C.orange).font("Helvetica-Bold").fontSize(9)
     .text(text, PX + 8, y + 6, { width: CW - 8, lineBreak: false })
     .restore();
  return y + 22;
}

export function buildDailySummaryMobileBuffer(summary, topHours = [], stock = {}) {
  return new Promise((resolve, reject) => {
    try {
      const hasTips        = summary.total_tips > 0;
      const totalSales     = summary.sales.length;
      const avgTicket      = totalSales ? summary.total_sales_amount / totalSales : 0;
      const hoursWithSales = (topHours || []).filter((h) => Number(h.total) > 0);
      const criticalList   = stock.critical || [];
      const lowList        = stock.low      || [];
      const pageH          = calcHeight(summary, hoursWithSales, stock);

      const doc = new PDFDocument({
        size:          [W, pageH],
        margins:       { top: 0, left: 0, right: 0, bottom: 0 },
        compress:      true,
        autoFirstPage: true,
      });

      const chunks = [];
      doc.on("data",  (c) => chunks.push(c));
      doc.on("end",   () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // ── Fondo blanco ─────────────────────────────────────────────────────────
      doc.save().rect(0, 0, W, pageH).fill(C.white).restore();

      // ── Header compacto ──────────────────────────────────────────────────────
      const HDR_H = 42;
      doc.save().rect(0, 0, W, HDR_H).fill(C.orange).restore();
      doc.save()
         .fillColor(C.white).font("Helvetica-Bold").fontSize(12)
         .text("FÉNIX POS", PX, 10, { width: CW / 2, lineBreak: false })
         .restore();
      doc.save()
         .fillColor(C.orangeLight).font("Helvetica").fontSize(11)
         .text(`Resumen del día · ${fmt.date(summary.date)}`, PX, 26, { width: CW, lineBreak: false })
         .restore();

      let y = HDR_H + 16;

      // ── Resumen general ──────────────────────────────────────────────────────
      y = sectionTitle(doc, "RESUMEN GENERAL", y);

      const kpis = [
        ["Total vendido",   fmtQ(summary.total_sales_amount), true ],
        ["Total cobrado",   fmtQ(summary.total_collected),    false],
        ...(hasTips ? [["Propinas", fmtQ(summary.total_tips), false]] : []),
        ["Utilidad",        fmtQ(summary.total_profit),       false],
        ["Ventas del día",  String(totalSales),               false],
        ["Ticket promedio", fmtQ(avgTicket),                  false],
      ];

      kpis.forEach(([lbl, val, accent], i) => {
        const ROW_H = 24;
        const bg    = i % 2 === 0 ? C.white : C.bg;
        doc.save().rect(PX, y, CW, ROW_H).fill(bg).restore();
        doc.save()
           .fillColor(C.muted).font("Helvetica").fontSize(11)
           .text(lbl, PX + 6, y + 6, { width: CW * 0.55, lineBreak: false })
           .restore();
        doc.save()
           .fillColor(accent ? C.orange : C.text).font("Helvetica-Bold").fontSize(13)
           .text(val, PX, y + 4, { width: CW - 6, align: "right", lineBreak: false })
           .restore();
        y += ROW_H;
      });

      y += 14;

      // ── Stock crítico ────────────────────────────────────────────────────────
      if (criticalList.length) {
        doc.save().rect(PX, y, CW, 20).fill(C.criticalBg).restore();
        doc.save().rect(PX, y, 3, 20).fill(C.critical).restore();
        doc.save()
           .fillColor(C.critical).font("Helvetica-Bold").fontSize(9)
           .text("STOCK CRÍTICO", PX + 8, y + 6, { width: CW - 8, lineBreak: false })
           .restore();
        y += 22;
        criticalList.forEach((p, i) => {
          const bg = i % 2 === 0 ? C.white : C.criticalBg;
          doc.save().rect(PX, y, CW, 20).fill(bg).restore();
          doc.save()
             .fillColor(C.text).font("Helvetica").fontSize(11)
             .text(p.name, PX + 6, y + 4, { width: CW * 0.74, lineBreak: false, ellipsis: true })
             .restore();
          doc.save()
             .fillColor(C.critical).font("Helvetica-Bold").fontSize(12)
             .text(String(p.stock), PX, y + 4, { width: CW - 6, align: "right", lineBreak: false })
             .restore();
          y += 20;
        });
        y += 14;
      }

      // ── Stock bajo ───────────────────────────────────────────────────────────
      if (lowList.length) {
        doc.save().rect(PX, y, CW, 20).fill(C.lowBg).restore();
        doc.save().rect(PX, y, 3, 20).fill(C.low).restore();
        doc.save()
           .fillColor(C.low).font("Helvetica-Bold").fontSize(9)
           .text("STOCK BAJO", PX + 8, y + 6, { width: CW - 8, lineBreak: false })
           .restore();
        y += 22;
        lowList.forEach((p, i) => {
          const bg = i % 2 === 0 ? C.white : C.lowBg;
          doc.save().rect(PX, y, CW, 20).fill(bg).restore();
          doc.save()
             .fillColor(C.text).font("Helvetica").fontSize(11)
             .text(p.name, PX + 6, y + 4, { width: CW * 0.74, lineBreak: false, ellipsis: true })
             .restore();
          doc.save()
             .fillColor(C.low).font("Helvetica-Bold").fontSize(12)
             .text(String(p.stock), PX, y + 4, { width: CW - 6, align: "right", lineBreak: false })
             .restore();
          y += 20;
        });
        y += 14;
      }

      // ── Ventas por hora ──────────────────────────────────────────────────────
      if (hoursWithSales.length) {
        y = sectionTitle(doc, "VENTAS POR HORA", y);
        hoursWithSales.forEach((h, i) => {
          const bg = i % 2 === 0 ? C.white : C.bg;
          doc.save().rect(PX, y, CW, 22).fill(bg).restore();
          doc.save()
             .fillColor(C.muted).font("Helvetica").fontSize(11)
             .text(`${String(h.hour).padStart(2, "0")}:00`, PX + 6, y + 5, { width: 44, lineBreak: false })
             .restore();
          doc.save()
             .fillColor(C.muted).font("Helvetica").fontSize(11)
             .text(`${h.count} vta${Number(h.count) !== 1 ? "s" : ""}`, PX + 54, y + 5, { width: 70, lineBreak: false })
             .restore();
          doc.save()
             .fillColor(C.text).font("Helvetica-Bold").fontSize(12)
             .text(fmtQ(h.total), PX, y + 4, { width: CW - 6, align: "right", lineBreak: false })
             .restore();
          y += 22;
        });
        y += 14;
      }

      // ── Productos vendidos ───────────────────────────────────────────────────
      if ((summary.sold_products || []).length) {
        y = sectionTitle(doc, "PRODUCTOS VENDIDOS", y);
        summary.sold_products.forEach((p, i) => {
          const bg = i % 2 === 0 ? C.white : C.bg;
          doc.save().rect(PX, y, CW, 20).fill(bg).restore();
          doc.save()
             .fillColor(C.text).font("Helvetica").fontSize(11)
             .text(p.name, PX + 6, y + 4, { width: CW * 0.74, lineBreak: false, ellipsis: true })
             .restore();
          doc.save()
             .fillColor(C.orange).font("Helvetica-Bold").fontSize(12)
             .text(`×${p.quantity}`, PX, y + 4, { width: CW - 6, align: "right", lineBreak: false })
             .restore();
          y += 20;
        });
        y += 14;
      }

      // ── Detalle de ventas ────────────────────────────────────────────────────
      y = sectionTitle(doc, `DETALLE DE VENTAS  (${totalSales})`, y);

      if (!totalSales) {
        doc.save()
           .fillColor(C.muted).font("Helvetica").fontSize(11)
           .text("Sin ventas pagadas en esta fecha.", PX + 6, y + 6, { width: CW })
           .restore();
      } else {
        // Columnas: # | Fecha/Hora | Cajero | [Propina] | Total
        const C_NUM  = 28;
        const C_DATE = hasTips ? 116 : 124;
        const C_SELL = hasTips ? 80  : 140;
        const C_TIP  = 68;
        const C_TOT  = CW - C_NUM - C_DATE - C_SELL - (hasTips ? C_TIP : 0);

        const HDRS = [
          { lbl: "#",          w: C_NUM,  al: "left"  },
          { lbl: "Fecha/Hora", w: C_DATE, al: "left"  },
          { lbl: "Cajero",     w: C_SELL, al: "left"  },
          ...(hasTips ? [{ lbl: "Propina", w: C_TIP, al: "right" }] : []),
          { lbl: "Total",      w: C_TOT,  al: "right" },
        ];

        // Cabecera de tabla
        const HDR_H = 18;
        doc.save().rect(PX, y, CW, HDR_H).fill(C.bg).restore();
        let hx = PX;
        HDRS.forEach((h) => {
          doc.save()
             .fillColor(C.muted).font("Helvetica-Bold").fontSize(9)
             .text(h.lbl, hx + 4, y + 4, { width: h.w - 8, align: h.al, lineBreak: false })
             .restore();
          hx += h.w;
        });
        y += HDR_H;

        // Filas de ventas
        const ROW_H = 28;
        summary.sales.forEach((s, i) => {
          const bg      = i % 2 === 0 ? C.white : C.bg;
          const tipAmt  = Number(s.tip || 0);
          const dateStr = s.paid_at ? fmt.datetime(s.paid_at) : summary.date;

          doc.save().rect(PX, y, CW, ROW_H).fill(bg).restore();

          const cells = [
            { text: `${s.monthly_number ?? s.id}`, w: C_NUM,  al: "left",  bold: false, col: C.muted },
            { text: dateStr,                        w: C_DATE, al: "left",  bold: false, col: C.muted },
            { text: s.seller || "—",                w: C_SELL, al: "left",  bold: false, col: C.text  },
            ...(hasTips ? [{ text: tipAmt > 0 ? fmtQ(tipAmt) : "—", w: C_TIP, al: "right", bold: false, col: C.low }] : []),
            { text: fmtQ(s.total),                  w: C_TOT,  al: "right", bold: true,  col: C.text  },
          ];

          let rx = PX;
          cells.forEach((cell) => {
            const fs = cell.bold ? 12 : 10;
            doc.save()
               .fillColor(cell.col)
               .font(cell.bold ? "Helvetica-Bold" : "Helvetica")
               .fontSize(fs)
               .text(cell.text, rx + 4, y + (ROW_H - fs) / 2, {
                 width: cell.w - 8, align: cell.al, lineBreak: false, ellipsis: true,
               })
               .restore();
            rx += cell.w;
          });
          y += ROW_H;
        });

        // Fila total
        const TOT_H = 26;
        doc.save().rect(PX, y, CW, TOT_H).fill(C.orangeMuted).restore();
        doc.save()
           .fillColor(C.text).font("Helvetica-Bold").fontSize(11)
           .text("TOTAL", PX + 6, y + 7, { width: CW * 0.5, lineBreak: false })
           .restore();
        doc.save()
           .fillColor(C.orange).font("Helvetica-Bold").fontSize(14)
           .text(fmtQ(summary.total_sales_amount), PX, y + 5, { width: CW - 6, align: "right", lineBreak: false })
           .restore();
        y += TOT_H;
      }

      // ── Footer ───────────────────────────────────────────────────────────────
      y += 10;
      doc.save()
         .fillColor(C.muted).font("Helvetica").fontSize(8)
         .text("Ingenieria de software por DLAB", PX, y, { width: CW, align: "center", lineBreak: false })
         .restore();

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
