import { C, LETTER, fmt } from "../theme.js";
import {
  createLetterDoc,
  drawTableHeader,
  drawTableRow,
  drawSectionTitle,
  ensureSpace,
} from "../layout-letter.js";

export function buildBodegaLetterBuffer(rows) {
  return new Promise((resolve, reject) => {
    try {
      const { doc, addPage, finalize, contentBottom, contentW } =
        createLetterDoc("Reporte de Bodega", fmt.todayFull());

      const chunks = [];
      doc.on("data",  (c) => chunks.push(c));
      doc.on("end",   () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const mx = LETTER.marginX;

      let y = addPage();

      const cols = [
        { label: "Insumo",       width: 220 },
        { label: "Unidad",       width: 70  },
        { label: "Stock actual", width: 80, align: "right" },
        { label: "Mínimo",       width: 70, align: "right" },
        { label: "Crítico",      width: 76, align: "right" },
      ];
      const colsTotal = cols.reduce((s, c) => s + c.width, 0);
      if (colsTotal !== contentW) cols[0].width += contentW - colsTotal;

      y = drawSectionTitle(doc, "Insumos", mx, y, contentW);
      y = drawTableHeader(doc, cols, mx, y, 20);

      if (!rows.length) {
        doc.save()
           .fillColor(C.muted).font("Helvetica").fontSize(LETTER.bodySize)
           .text("No hay insumos registrados.", mx, y + 6, { width: contentW, align: "center", lineBreak: false })
           .restore();
        y += 20;
      } else {
        rows.forEach((row, i) => {
          if (ensureSpace(y, LETTER.tableRowH + 2, contentBottom)) {
            y = addPage();
            y = drawSectionTitle(doc, "Insumos (cont.)", mx, y, contentW);
            y = drawTableHeader(doc, cols, mx, y, 20);
          }

          const stock    = Number(row.stock_actual  || 0);
          const min      = Number(row.stock_min     || 0);
          const critical = Number(row.stock_critico || 0);

          const vals = [
            row.nombre,
            row.unidad_base || "—",
            String(Number(stock.toFixed(2))),
            String(Number(min.toFixed(2))),
            String(Number(critical.toFixed(2))),
          ];

          y = drawTableRow(doc, cols, vals, mx, y, LETTER.tableRowH, { even: i % 2 === 1 });
        });
      }

      const totalRows = rows.length;
      const critCount = rows.filter((r) => {
        const s = Number(r.stock_actual || 0);
        const c = Number(r.stock_critico || 0);
        return c > 0 && s <= c;
      }).length;
      const lowCount = rows.filter((r) => {
        const s = Number(r.stock_actual  || 0);
        const c = Number(r.stock_critico || 0);
        const m = Number(r.stock_min     || 0);
        return m > 0 && s > c && s <= m;
      }).length;

      if (ensureSpace(y, LETTER.tableRowH * 3 + 10, contentBottom)) y = addPage();
      y += 2;
      drawTableRow(
        doc, cols,
        ["TOTAL DE INSUMOS", "", String(totalRows), "", ""],
        mx, y, LETTER.tableRowH + 2,
        { bold: true }
      );
      y += LETTER.tableRowH + 4;

      if (critCount > 0 || lowCount > 0) {
        doc.save()
           .fillColor(C.muted).font("Helvetica-Oblique").fontSize(LETTER.labelSize)
           .text(
             `Críticos: ${critCount}   Bajos: ${lowCount}`,
             mx, y + 4,
             { width: contentW, align: "left", lineBreak: false }
           )
           .restore();
      }

      finalize();
    } catch (err) {
      reject(err);
    }
  });
}
