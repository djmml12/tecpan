/**
 * Alerta de stock — formato móvil (420×740pt, página única).
 * Adjunto de correo orientado a lectura en smartphone.
 *
 * data: {
 *   critical: Array<{name, stock, category}>,
 *   low:      Array<{name, stock, category}>,
 *   thresholds: { criticalStock, lowStock }
 * }
 */
import { C, MOBILE, fmt } from "../theme.js";
import {
  createMobileDoc,
  SLOTS,
  drawMobileHeader,
  drawMobileSectionTitle,
  drawMobileFooter,
  drawMobileList,
} from "../layout-mobile.js";

export function buildStockAlertMobileBuffer(data) {
  return new Promise((resolve, reject) => {
    try {
      const critical   = (data.critical || []).slice(0, 10);
      const low        = (data.low       || []).filter((p) =>
        !critical.find((c) => c.id === p.id)
      ).slice(0, 8);
      const thresholds = data.thresholds || { criticalStock: 5, lowStock: 15 };

      const doc    = createMobileDoc();
      const chunks = [];

      doc.on("data",  (c) => chunks.push(c));
      doc.on("end",   () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const px = MOBILE.paddingX;
      const cw = MOBILE.contentW;

      // ── 1. Encabezado ──────────────────────────────────────────────────────
      drawMobileHeader(doc, "Alerta de Stock", fmt.today());

      // ── 2. Métricas clave en dos tarjetas ──────────────────────────────────
      const { y: km, h: kh } = SLOTS.kpiMain;
      const cardW = (cw - 10) / 2;

      // Tarjeta crítico
      doc.save().roundedRect(px, km + 8, cardW, kh - 16, 8)
         .fillAndStroke(C.criticalBg, C.criticalBorder).restore();
      doc.save()
         .fillColor(C.muted).font("Helvetica").fontSize(MOBILE.labelSize + 1)
         .text(`Crítico (≤ ${thresholds.criticalStock} u.)`, px, km + 16, {
           width: cardW, align: "center", lineBreak: false,
         })
         .restore();
      doc.save()
         .fillColor(C.critical).font("Helvetica-Bold").fontSize(MOBILE.kpiValueSize)
         .text(String(data.critical?.length ?? 0), px, km + 32, {
           width: cardW, align: "center", lineBreak: false,
         })
         .restore();

      // Tarjeta bajo
      const lx = px + cardW + 10;
      doc.save().roundedRect(lx, km + 8, cardW, kh - 16, 8)
         .fillAndStroke(C.lowBg, C.lowBorder).restore();
      doc.save()
         .fillColor(C.muted).font("Helvetica").fontSize(MOBILE.labelSize + 1)
         .text(`Bajo (≤ ${thresholds.lowStock} u.)`, lx, km + 16, {
           width: cardW, align: "center", lineBreak: false,
         })
         .restore();
      doc.save()
         .fillColor(C.low).font("Helvetica-Bold").fontSize(MOBILE.kpiValueSize)
         .text(String(data.low?.length ?? 0), lx, km + 32, {
           width: cardW, align: "center", lineBreak: false,
         })
         .restore();

      // ── 3. Ocupamos kpisRow + chart para la lista de críticos ──────────────
      const { y: ky } = SLOTS.kpisRow;
      let curY = ky + 4;

      if (critical.length) {
        curY = drawMobileSectionTitle(doc, "🔴 Stock crítico", curY);

        const colDefs = [{ w: 230 }, { w: 80, align: "center" }, { w: 74, align: "right" }];
        const rows    = critical.map((p) => ({
          cols: [
            p.name,
            p.category || "—",
            `${p.stock} u.`,
          ],
        }));

        // Mini cabecera
        ["Producto", "Categoría", "Stock"].forEach((h, i) => {
          doc.save()
             .fillColor(C.critical).font("Helvetica-Bold").fontSize(MOBILE.labelSize)
             .text(h, px + colDefs.slice(0, i).reduce((s, c) => s + c.w, 0) + 3, curY, {
               width: colDefs[i].w - 6, align: colDefs[i].align ?? "left", lineBreak: false,
             })
             .restore();
        });
        curY += 12;

        const maxAvail = SLOTS.chart.y + SLOTS.chart.h - curY - 6;
        const maxRows  = Math.floor(maxAvail / MOBILE.detailRowH);
        curY = drawMobileList(doc, rows.slice(0, maxRows), colDefs, px, curY, maxAvail, MOBILE.detailRowH);
        curY += 6;
      }

      // ── 4. Slot detail — lista de stock bajo ───────────────────────────────
      const { y: dy, h: dh } = SLOTS.detail;
      curY = Math.max(curY, dy);

      if (low.length) {
        curY = drawMobileSectionTitle(doc, "🟡 Stock bajo", curY);

        const colDefs = [{ w: 230 }, { w: 80, align: "center" }, { w: 74, align: "right" }];
        const rows    = low.map((p) => ({
          cols: [p.name, p.category || "—", `${p.stock} u.`],
        }));

        // Mini cabecera
        ["Producto", "Categoría", "Stock"].forEach((h, i) => {
          doc.save()
             .fillColor(C.low).font("Helvetica-Bold").fontSize(MOBILE.labelSize)
             .text(h, px + colDefs.slice(0, i).reduce((s, c) => s + c.w, 0) + 3, curY, {
               width: colDefs[i].w - 6, align: colDefs[i].align ?? "left", lineBreak: false,
             })
             .restore();
        });
        curY += 12;

        const maxAvail = dy + dh - curY - 10;
        const maxRows  = Math.floor(maxAvail / MOBILE.detailRowH);
        drawMobileList(doc, rows.slice(0, maxRows), colDefs, px, curY, maxAvail, MOBILE.detailRowH);
      } else if (!critical.length) {
        // Sin alertas
        doc.save()
           .fillColor(C.ok).font("Helvetica-Bold").fontSize(13)
           .text("✓ Inventario en niveles normales", px, dy + 50, {
             width: cw, align: "center", lineBreak: false,
           })
           .restore();
      }

      // ── 5. Pie ─────────────────────────────────────────────────────────────
      drawMobileFooter(doc);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
