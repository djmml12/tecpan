import PDFDocument from "pdfkit";
import { C, LETTER, fmt } from "./theme.js";
import { drawLogo } from "./logo.js";

// ── Fábrica de documento carta ────────────────────────────────────────────────

export function createLetterDoc(title, subtitle = "") {
  const doc = new PDFDocument({
    size:          [LETTER.width, LETTER.height],
    margins:       { top: LETTER.marginY, left: LETTER.marginX, right: LETTER.marginX, bottom: LETTER.marginY },
    compress:      true,
    autoFirstPage: false,
    bufferPages:   true,
  });

  function drawHeader() {
    const _sx = doc.x, _sy = doc.y;
    const m  = LETTER.marginX;
    const cw = LETTER.contentW;
    const pw = LETTER.width;

    const y0 = LETTER.marginY;

    // Línea mostaza inferior del header
    const lineY = y0 + LETTER.headerH - 6;
    doc.save()
       .strokeColor(C.orange).lineWidth(2)
       .moveTo(m, lineY).lineTo(m + cw, lineY).stroke()
       .restore();

    // TECPANCITO — mostaza, izquierda
    doc.save()
       .fillColor(C.orange).font("Helvetica-Bold").fontSize(22)
       .text("TECPANCITO", m, y0 + 6, { width: 160, lineBreak: false })
       .restore();

    // Título — marrón oscuro, centrado
    doc.save()
       .fillColor(C.text).font("Helvetica-Bold").fontSize(22)
       .text(title, m, subtitle ? y0 + 6 : y0 + 16, { width: cw, align: "center", lineBreak: false })
       .restore();

    // Subtítulo — mostaza profunda, centrado
    if (subtitle) {
      doc.save()
         .fillColor(C.orangeDeep).font("Helvetica-Bold").fontSize(14)
         .text(subtitle, m, y0 + 6 + 22 + 5, { width: cw, align: "center", lineBreak: false })
         .restore();
    }

    // Fecha — muted, derecha
    doc.save()
       .fillColor(C.muted).font("Helvetica").fontSize(10)
       .text(fmt.todayFull(), m, y0 + 6, { width: cw, align: "right", lineBreak: false })
       .restore();

    doc.x = _sx; doc.y = _sy;
  }

  function drawFooter(pageNum, totalPages) {
    // El footer va dentro del margen inferior. PDFKit dispara auto-page cuando
    // y > page.maxY(), aun con lineBreak:false y coordenadas explícitas.
    // Desactivamos el margen inferior temporalmente y reseteamos doc.x/doc.y.
    const origBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.x = LETTER.marginX;
    doc.y = LETTER.marginY;

    const m  = LETTER.marginX;
    const fy = LETTER.height - LETTER.marginY + 6;
    const cw = LETTER.contentW;

    doc.save()
       .strokeColor(C.border).lineWidth(0.5)
       .moveTo(m, fy - 4).lineTo(m + cw, fy - 4).stroke()
       .restore();

    doc.save()
       .fillColor(C.muted).font("Helvetica").fontSize(LETTER.labelSize)
       .text("Tecpancito", m, fy + 1, { width: cw / 2, align: "left", lineBreak: false })
       .restore();

    doc.save()
       .fillColor(C.muted).font("Helvetica").fontSize(LETTER.labelSize)
       .text(`Pág. ${pageNum} / ${totalPages}`, m, fy + 1, { width: cw, align: "right", lineBreak: false })
       .restore();

    doc.page.margins.bottom = origBottomMargin;
  }

  const contentY      = LETTER.marginY + LETTER.headerH;
  const contentBottom = LETTER.height - LETTER.marginY - LETTER.footerH;
  const contentW      = LETTER.contentW;

  function addPage() {
    doc.addPage();
    drawHeader();
    doc.y = contentY;
    return contentY;
  }

  function drawCredit() {
    const origBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.x = LETTER.marginX;
    doc.y = LETTER.marginY;

    const cy = LETTER.height - LETTER.marginY + 18;
    doc.save()
       .fillColor(C.muted).font("Helvetica-Oblique").fontSize(LETTER.labelSize)
       .text("Ingeniería de software por DLAB", LETTER.marginX, cy, {
         width: LETTER.contentW, align: "center", lineBreak: false,
       })
       .restore();

    doc.page.margins.bottom = origBottomMargin;
  }

  function finalize() {
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      drawFooter(i + 1, range.count);
      if (i === range.count - 1) drawCredit();
    }
    doc.end();
  }

  return { doc, addPage, finalize, contentY, contentBottom, contentW };
}

// ── KPIs en formato texto (sin cajas de color) ───────────────────────────────

/**
 * Dibuja una lista vertical de "Etiqueta: Valor" con tipografía limpia.
 * @param {PDFDocument} doc
 * @param {Array<{label:string, value:string}>} pairs
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {object} opts  { columns? = 1, lineH? = 20, labelRatio? = 0.5 }
 * @returns {number} y final
 */
export function drawKpiText(doc, pairs, x, y, w, opts = {}) {
  const _sx = doc.x, _sy = doc.y;

  const columns    = opts.columns    ?? 1;
  const lineH      = opts.lineH      ?? 20;
  const labelRatio = opts.labelRatio ?? 0.55;
  const colGap     = 18;
  const colW       = (w - colGap * (columns - 1)) / columns;
  const labelSize  = 10;
  const valueSize  = 12;

  pairs.forEach((kpi, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const cx  = x + col * (colW + colGap);
    const cy  = y + row * lineH;

    const labelW = Math.round(colW * labelRatio);
    const valueW = colW - labelW - 4;

    doc.save()
       .fillColor(C.muted).font("Helvetica").fontSize(labelSize)
       .text(kpi.label, cx, cy + 3, { width: labelW, lineBreak: false, ellipsis: true })
       .restore();

    doc.save()
       .fillColor(C.orange).font("Helvetica-Bold").fontSize(valueSize)
       .text(String(kpi.value), cx + labelW, cy + 1, {
         width: valueW, align: "right", lineBreak: false, ellipsis: true,
       })
       .restore();
  });

  const rows = Math.ceil(pairs.length / columns);
  doc.x = _sx; doc.y = _sy;
  return y + rows * lineH;
}

// ── Tablas ────────────────────────────────────────────────────────────────────

export function drawTableHeader(doc, cols, x, y, h = 20) {
  const _sx = doc.x, _sy = doc.y;
  const totalW = cols.reduce((s, c) => s + c.width, 0);

  // Fondo naranja suave + barra izquierda naranja sólida
  doc.save().rect(x, y, totalW, h).fill(C.orangeMuted).restore();
  doc.save().rect(x, y, 2, h).fill(C.orange).restore();

  // Línea inferior naranja
  doc.save()
     .strokeColor(C.orange).lineWidth(0.8)
     .moveTo(x, y + h).lineTo(x + totalW, y + h).stroke()
     .restore();

  let cx = x;
  cols.forEach((col) => {
    doc.save()
       .fillColor(C.text).font("Helvetica-Bold").fontSize(LETTER.tableSize)
       .text(col.label, cx + 5, y + (h - LETTER.tableSize) / 2 + 1, {
         width: col.width - 10, align: col.align ?? "left", lineBreak: false,
       })
       .restore();
    cx += col.width;
  });
  doc.x = _sx; doc.y = _sy;
  return y + h;
}

export function drawTableRow(doc, cols, values, x, y, h = LETTER.tableRowH, opts = {}) {
  const _sx = doc.x, _sy = doc.y;
  const totalW = cols.reduce((s, c) => s + c.width, 0);

  if (opts.bold) {
    doc.save().rect(x, y, totalW, h).fill(C.orangeMuted).restore();
  } else if (opts.even) {
    doc.save().rect(x, y, totalW, h).fill(C.bg).restore();
  }

  doc.save()
     .strokeColor(opts.bold ? C.orange : C.border).lineWidth(opts.bold ? 0.8 : 0.3)
     .moveTo(x, y + h).lineTo(x + totalW, y + h).stroke()
     .restore();

  const textColor = opts.bold ? C.orange : C.text;
  let cx = x;
  cols.forEach((col, i) => {
    doc.save()
       .fillColor(textColor)
       .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
       .fontSize(LETTER.tableSize)
       .text(String(values[i] ?? ""), cx + 5, y + (h - LETTER.tableSize) / 2 + 1, {
         width: col.width - 10, align: col.align ?? "left", lineBreak: false, ellipsis: true,
       })
       .restore();
    cx += col.width;
  });
  doc.x = _sx; doc.y = _sy;
  return y + h;
}

// ── Encabezado de sección ─────────────────────────────────────────────────────

export function drawSectionTitle(doc, title, x, y, w) {
  const _sx = doc.x, _sy = doc.y;
  const bh = LETTER.headingSize + 8;
  doc.save().rect(x, y, w, bh).fill(C.orangeMuted).restore();
  doc.save().roundedRect(x, y, 3, bh, 1).fill(C.orange).restore();
  doc.save()
     .fillColor(C.text).font("Helvetica-Bold").fontSize(LETTER.headingSize)
     .text(title, x + 10, y + (bh - LETTER.headingSize) / 2, { width: w - 10, lineBreak: false })
     .restore();
  doc.x = _sx; doc.y = _sy;
  return y + bh + LETTER.sectionGap / 2;
}

// ── Salto de página ───────────────────────────────────────────────────────────

/**
 * Verifica si `needed` cabe a partir de la posición actual `y`.
 * Usa la `y` lógica (no `doc.y`) para evitar drift.
 */
export function ensureSpace(y, needed, contentBottom) {
  return y + needed > contentBottom;
}

// Mantengo la firma antigua para no romper callers existentes;
// la nueva (basada en `y` lógica) es ensureSpace.
export function needsPageBreak(doc, needed, contentBottom) {
  return doc.y + needed > contentBottom;
}
