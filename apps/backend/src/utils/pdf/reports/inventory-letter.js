import { C, LETTER, fmt } from "../theme.js";
import {
  createLetterDoc,
  drawTableHeader,
  drawTableRow,
  drawSectionTitle,
  ensureSpace,
} from "../layout-letter.js";

export function buildInventoryLetterBuffer(rows) {
  return new Promise((resolve, reject) => {
    try {
      const { doc, addPage, finalize, contentBottom, contentW } =
        createLetterDoc("Reporte de Inventario", fmt.todayFull());

      const chunks = [];
      doc.on("data",  (c) => chunks.push(c));
      doc.on("end",   () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const mx = LETTER.marginX;

      let y = addPage();

      const cols = [
        { label: "Producto",  width: 280 },
        { label: "Categoría", width: 150 },
        { label: "Stock",     width: 86,  align: "right" },
      ];
      const colsTotal = cols.reduce((s, c) => s + c.width, 0);
      if (colsTotal !== contentW) cols[1].width += contentW - colsTotal;

      y = drawSectionTitle(doc, "Productos", mx, y, contentW);
      y = drawTableHeader(doc, cols, mx, y, 20);

      const totalStock = rows.reduce((s, r) => s + Number(r.stock || 0), 0);

      if (!rows.length) {
        doc.save()
           .fillColor(C.muted).font("Helvetica").fontSize(LETTER.bodySize)
           .text("No hay productos registrados.", mx, y + 6, { width: contentW, align: "center", lineBreak: false })
           .restore();
        y += 20;
      } else {
        rows.forEach((row, i) => {
          if (ensureSpace(y, LETTER.tableRowH + 2, contentBottom)) {
            y = addPage();
            y = drawSectionTitle(doc, "Productos (cont.)", mx, y, contentW);
            y = drawTableHeader(doc, cols, mx, y, 20);
          }

          const stock = Number(row.stock || 0);
          const cat   = row.subcategory
            ? `${row.category} / ${row.subcategory}`
            : (row.category || "—");

          y = drawTableRow(doc, cols, [row.name, cat, String(stock)], mx, y, LETTER.tableRowH, { even: i % 2 === 1 });
        });
      }

      if (ensureSpace(y, LETTER.tableRowH + 6, contentBottom)) {
        y = addPage();
        y = drawTableHeader(doc, cols, mx, y, 20);
      }
      y += 2;
      drawTableRow(
        doc, cols,
        ["TOTAL", "", fmt.number(totalStock)],
        mx, y, LETTER.tableRowH + 2,
        { bold: true }
      );

      finalize();
    } catch (err) {
      reject(err);
    }
  });
}
