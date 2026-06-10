import PDFDocument from "pdfkit";
import { C, MOBILE, fmt } from "./theme.js";

// ── Posiciones Y fijas de cada slot (página única 420×740) ───────────────────
// 35 + 72 + 95 + 68 + 152 + 228 + 55 + 35 = 740 ✓

export const SLOTS = {
  header:  { y:  35, h: MOBILE.headerH  },   // 35..107
  kpiMain: { y: 107, h: MOBILE.kpiMainH },   // 107..202
  kpisRow: { y: 202, h: MOBILE.kpisRowH },   // 202..270
  chart:   { y: 270, h: MOBILE.chartH   },   // 270..422
  detail:  { y: 422, h: MOBILE.detailH  },   // 422..650
  footer:  { y: 650, h: MOBILE.footerH  },   // 650..705
};

// ── Fábrica de documento móvil ────────────────────────────────────────────────

/**
 * Crea un PDFDocument de página única 420×740pt.
 */
export function createMobileDoc() {
  const doc = new PDFDocument({
    size:     [MOBILE.width, MOBILE.height],
    margins:  { top: 0, left: 0, right: 0, bottom: 0 },
    compress: true,
    autoFirstPage: true,
  });
  // Fondo blanco
  doc.save().rect(0, 0, MOBILE.width, MOBILE.height).fill(C.white).restore();
  return doc;
}

// ── Slot: Encabezado ──────────────────────────────────────────────────────────

/**
 * Cabecera naranja con título y subtítulo.
 * El logo naranja sobre fondo naranja no es visible, se usa texto blanco.
 */
export function drawMobileHeader(doc, title, subtitle = "") {
  const { y, h } = SLOTS.header;
  const px       = MOBILE.paddingX;
  const cw       = MOBILE.contentW;

  // Fondo naranja (incluye el margen superior de 35pt)
  doc.save().rect(0, 0, MOBILE.width, y + h).fill(C.orange).restore();

  // "FÉNIX" en blanco — izquierda
  doc.save()
     .fillColor(C.white).font("Helvetica-Bold").fontSize(18)
     .text("FÉNIX", px, y + 14, { width: 80, lineBreak: false })
     .restore();

  // Título
  doc.save()
     .fillColor(C.white).font("Helvetica-Bold").fontSize(MOBILE.titleSize)
     .text(title, px, y + 12, { width: cw, align: "center", lineBreak: false })
     .restore();

  // Subtítulo / fecha
  if (subtitle) {
    doc.save()
       .fillColor(C.orangeLight).font("Helvetica").fontSize(MOBILE.subtitleSize)
       .text(subtitle, px, y + 14 + MOBILE.titleSize + 3, {
         width: cw, align: "center", lineBreak: false,
       })
       .restore();
  }
}

// ── Slot: KPI Principal ───────────────────────────────────────────────────────

/**
 * KPI principal grande (total del día).
 */
export function drawMobileKpiMain(doc, label, value, opts = {}) {
  const { y, h } = SLOTS.kpiMain;
  const px       = MOBILE.paddingX;
  const cw       = MOBILE.contentW;
  const color    = opts.color ?? C.orange;

  doc.save().roundedRect(px, y + 6, cw, h - 12, 8)
     .fillAndStroke(C.orangeMuted, C.orangeLight).restore();

  // Etiqueta
  doc.save()
     .fillColor(C.muted).font("Helvetica").fontSize(MOBILE.labelSize + 2)
     .text(label, px, y + 18, { width: cw, align: "center", lineBreak: false })
     .restore();

  // Valor grande
  doc.save()
     .fillColor(color).font("Helvetica-Bold").fontSize(MOBILE.kpiValueSize)
     .text(String(value), px, y + 32, { width: cw, align: "center", lineBreak: false })
     .restore();
}

// ── Slot: Fila de 3 KPIs pequeños ────────────────────────────────────────────

/**
 * @param {Array<{label, value, color?}>} kpis  max 3 elementos
 */
export function drawMobileKpiRow(doc, kpis) {
  const { y, h } = SLOTS.kpisRow;
  const px       = MOBILE.paddingX;
  const cw       = MOBILE.contentW;
  const n        = Math.min(kpis.length, 3);
  const gap      = 8;
  const kw       = Math.floor((cw - gap * (n - 1)) / n);

  kpis.slice(0, n).forEach((kpi, i) => {
    const kx    = px + i * (kw + gap);
    const color = kpi.color ?? C.orange;

    doc.save().roundedRect(kx, y + 5, kw, h - 10, 6)
       .fillAndStroke(C.bg, C.border).restore();

    doc.save()
       .fillColor(color).font("Helvetica-Bold").fontSize(MOBILE.kpiValueSize - 6)
       .text(String(kpi.value), kx + 4, y + 15, { width: kw - 8, align: "center", lineBreak: false })
       .restore();

    doc.save()
       .fillColor(C.muted).font("Helvetica").fontSize(MOBILE.labelSize)
       .text(kpi.label, kx + 4, y + h - MOBILE.labelSize - 12, {
         width: kw - 8, align: "center", lineBreak: false,
       })
       .restore();
  });
}

// ── Slot: Título de sección ───────────────────────────────────────────────────

/**
 * Encabezado de sección dentro de un slot (retorna Y después del título).
 */
export function drawMobileSectionTitle(doc, title, atY) {
  const px = MOBILE.paddingX;
  const cw = MOBILE.contentW;

  doc.save().rect(px - 1, atY, cw + 2, 16).fill(C.bg).restore();
  // Barra naranja izquierda
  doc.save().roundedRect(px - 1, atY, 3, 16, 1).fill(C.orange).restore();
  doc.save()
     .fillColor(C.text).font("Helvetica-Bold").fontSize(MOBILE.subtitleSize)
     .text(title, px + 6, atY + 3, { width: cw - 12, lineBreak: false })
     .restore();

  return atY + 18;
}

// ── Slot: Pie de página ───────────────────────────────────────────────────────

export function drawMobileFooter(doc) {
  const { y } = SLOTS.footer;
  const px    = MOBILE.paddingX;
  const cw    = MOBILE.contentW;
  const ts    = fmt.todayFull();

  doc.save().strokeColor(C.border).lineWidth(0.5)
     .moveTo(px, y + 4).lineTo(px + cw, y + 4).stroke()
     .restore();

  doc.save()
     .fillColor(C.muted).font("Helvetica").fontSize(MOBILE.labelSize)
     .text("Tecpancito", px, y + 10, { width: cw, align: "center", lineBreak: false })
     .restore();

  doc.save()
     .fillColor(C.muted).font("Helvetica").fontSize(MOBILE.labelSize)
     .text(ts, px, y + 10 + MOBILE.labelSize + 5, {
       width: cw, align: "center", lineBreak: false,
     })
     .restore();
}

// ── Listado genérico dentro de un slot ───────────────────────────────────────

/**
 * Dibuja una lista de filas dentro de un área delimitada.
 * @param {PDFDocument} doc
 * @param {Array<{cols: string[], bold?: boolean}>} rows
 * @param {Array<{w: number, align?: string}>} colDefs
 * @param {number} x  X inicio
 * @param {number} y  Y inicio
 * @param {number} maxH  Altura máxima disponible
 * @param {number} rowH  Alto de fila
 */
export function drawMobileList(doc, rows, colDefs, x, y, maxH, rowH = MOBILE.detailRowH) {
  const totalW = colDefs.reduce((s, c) => s + c.w, 0);
  let cy       = y;

  rows.forEach((row, i) => {
    if (cy + rowH > y + maxH) return; // cortar si excede

    const bg = i % 2 === 0 ? C.white : C.bg;
    doc.save().rect(x, cy, totalW, rowH).fill(bg).restore();

    let cx = x;
    colDefs.forEach((col, j) => {
      doc.save()
         .fillColor(C.text)
         .font(row.bold ? "Helvetica-Bold" : "Helvetica")
         .fontSize(MOBILE.bodySize)
         .text(String(row.cols[j] ?? ""), cx + 3, cy + (rowH - MOBILE.bodySize) / 2, {
           width: col.w - 6, align: col.align ?? "left", lineBreak: false, ellipsis: true,
         })
         .restore();
      cx += col.w;
    });

    cy += rowH;
  });

  // Borde inferior de la lista
  doc.save().strokeColor(C.border).lineWidth(0.3)
     .moveTo(x, cy).lineTo(x + totalW, cy).stroke()
     .restore();

  return cy;
}
