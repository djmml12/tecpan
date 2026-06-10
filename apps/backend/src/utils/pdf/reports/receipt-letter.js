/**
 * Recibo de venta — formato carta limpio con logo naranja.
 * Se genera bajo demanda (GET /api/reports/receipt/:id).
 *
 * sale: resultado de getSaleByIdService(id)
 *       { id, monthly_number, reference, user_name, created_at, paid_at,
 *         total, tip_amount, tip_percentage, items: [{name, quantity, price}] }
 */
import { C, LETTER, fmt } from "../theme.js";
import { drawLogo }        from "../logo.js";
import PDFDocument         from "pdfkit";

export function buildReceiptLetterBuffer(sale) {
  return new Promise((resolve, reject) => {
    try {
      const doc    = new PDFDocument({ size: "LETTER", margins: { top: 60, left: 60, right: 60, bottom: 60 }, compress: true });
      const chunks = [];

      doc.on("data",  (c) => chunks.push(c));
      doc.on("end",   () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageW = doc.page.width;    // 612
      const mx    = 60;
      const cw    = pageW - mx * 2;   // 492

      // ── Encabezado: logo + nombre empresa ──────────────────────────────────
      drawLogo(doc, mx, 60, 110, 36);

      doc.save()
         .fillColor(C.text).font("Helvetica-Bold").fontSize(20)
         .text("Recibo de Venta", mx, 68, { width: cw, align: "center", lineBreak: false })
         .restore();

      // Línea naranja
      doc.save().strokeColor(C.orange).lineWidth(2)
         .moveTo(mx, 104).lineTo(mx + cw, 104).stroke()
         .restore();

      // ── Info de la venta ────────────────────────────────────────────────────
      let y = 118;

      const infoRows = [
        ["Venta",    `#${sale.monthly_number ?? sale.id}`],
        ["Referencia", sale.reference || "—"],
        ["Cajero",   sale.user_name  || "—"],
        ["Fecha",    fmt.datetime(sale.paid_at || sale.created_at)],
      ];

      infoRows.forEach(([label, val]) => {
        doc.save()
           .fillColor(C.muted).font("Helvetica").fontSize(10)
           .text(label, mx, y, { width: 120, lineBreak: false })
           .restore();
        doc.save()
           .fillColor(C.text).font("Helvetica-Bold").fontSize(10)
           .text(String(val), mx + 125, y, { width: cw - 125, lineBreak: false })
           .restore();
        y += 18;
      });

      y += 8;

      // ── Tabla de ítems ──────────────────────────────────────────────────────
      const cols = [
        { label: "Producto", width: 260 },
        { label: "Cant.",    width: 64,  align: "center" },
        { label: "P. unit.", width: 84,  align: "right"  },
        { label: "Subtotal", width: 84,  align: "right"  },
      ];
      // ajuste
      const totalCW = cols.reduce((s, c) => s + c.width, 0);
      if (totalCW !== cw) cols[0].width += cw - totalCW;

      // Encabezado tabla
      const hdrH = 22;
      doc.save().roundedRect(mx, y, cw, hdrH, 4).fill(C.orange).restore();
      let cx = mx;
      cols.forEach((col) => {
        doc.save()
           .fillColor(C.white).font("Helvetica-Bold").fontSize(10)
           .text(col.label, cx + 6, y + 5, { width: col.width - 12, align: col.align ?? "left", lineBreak: false })
           .restore();
        cx += col.width;
      });
      y += hdrH + 2;

      // Filas de ítems
      (sale.items || []).forEach((item, i) => {
        const qty      = Number(item.quantity || 0);
        const price    = Number(item.price    || 0);
        const subtotal = qty * price;
        const bg       = i % 2 === 0 ? C.white : C.bg;

        doc.save().rect(mx, y, cw, 20).fill(bg).restore();
        doc.save().strokeColor(C.border).lineWidth(0.3)
           .moveTo(mx, y + 20).lineTo(mx + cw, y + 20).stroke()
           .restore();

        const vals = [item.name, String(qty), fmt.currency(price), fmt.currency(subtotal)];
        let vx = mx;
        cols.forEach((col, j) => {
          doc.save()
             .fillColor(C.text).font("Helvetica").fontSize(9.5)
             .text(vals[j], vx + 6, y + 5, { width: col.width - 12, align: col.align ?? "left", lineBreak: false, ellipsis: true })
             .restore();
          vx += col.width;
        });
        y += 20;
      });

      y += 14;

      // ── Totales ─────────────────────────────────────────────────────────────
      const tipAmt   = Number(sale.tip_amount    || 0);
      const tipPct   = Number(sale.tip_percentage || 0);
      const subtotal = Number(sale.total          || 0);
      const total    = subtotal + tipAmt;

      const totalsW  = 220;
      const totalsX  = mx + cw - totalsW;

      const totalsRows = tipAmt > 0
        ? [
            { label: "Subtotal",                 val: fmt.currency(subtotal), bold: false },
            { label: `Propina (${tipPct}%)`,      val: fmt.currency(tipAmt),  bold: false },
            { label: "TOTAL",                     val: fmt.currency(total),   bold: true  },
          ]
        : [
            { label: "TOTAL",                     val: fmt.currency(subtotal), bold: true },
          ];

      totalsRows.forEach((row) => {
        if (row.bold) {
          doc.save().roundedRect(totalsX, y, totalsW, 24, 4)
             .fillAndStroke(C.orangeMuted, C.orangeLight).restore();
        }
        doc.save()
           .fillColor(row.bold ? C.orange : C.muted)
           .font(row.bold ? "Helvetica-Bold" : "Helvetica")
           .fontSize(row.bold ? 13 : 10)
           .text(row.label, totalsX + 10, y + (row.bold ? 5 : 3), { width: 100, lineBreak: false })
           .restore();
        doc.save()
           .fillColor(row.bold ? C.orange : C.text)
           .font(row.bold ? "Helvetica-Bold" : "Helvetica")
           .fontSize(row.bold ? 13 : 10)
           .text(row.val, totalsX + 10, y + (row.bold ? 5 : 3), {
             width: totalsW - 20, align: "right", lineBreak: false,
           })
           .restore();
        y += row.bold ? 28 : 20;
      });

      // ── Nota al pie ─────────────────────────────────────────────────────────
      if (tipAmt > 0) {
        y += 8;
        doc.save()
           .fillColor(C.muted).font("Helvetica").fontSize(8)
           .text("* Las propinas son una cuenta aparte y no se incluyen en las utilidades del negocio.",
             mx, y, { width: cw, lineBreak: false })
           .restore();
      }

      // ── Pie de página ────────────────────────────────────────────────────────
      const footY = doc.page.height - 50;
      doc.save().strokeColor(C.border).lineWidth(0.5)
         .moveTo(mx, footY).lineTo(mx + cw, footY).stroke()
         .restore();
      doc.save()
         .fillColor(C.muted).font("Helvetica").fontSize(8)
         .text("Generado por Tecpancito", mx, footY + 8, { width: cw, align: "center", lineBreak: false })
         .restore();

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
