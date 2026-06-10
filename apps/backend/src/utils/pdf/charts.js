import { C } from "./theme.js";

// ── Helpers internos ──────────────────────────────────────────────────────────

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

/**
 * Construye un path SVG para un sector de círculo (para gráfica de dona).
 * @param {number} cx  Centro X
 * @param {number} cy  Centro Y
 * @param {number} r   Radio
 * @param {number} a0  Ángulo inicio (radianes)
 * @param {number} a1  Ángulo fin (radianes)
 */
function sectorPath(cx, cy, r, a0, a1) {
  const x1 = cx + r * Math.cos(a0);
  const y1 = cy + r * Math.sin(a0);
  const x2 = cx + r * Math.cos(a1);
  const y2 = cy + r * Math.sin(a1);
  const large = (a1 - a0) > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

// ── Barras Verticales ─────────────────────────────────────────────────────────

/**
 * Dibuja una gráfica de barras verticales.
 * @param {PDFDocument} doc
 * @param {number} x      Esquina superior izquierda
 * @param {number} y
 * @param {number} w      Ancho total del área
 * @param {number} h      Alto total del área
 * @param {Array<{label:string, value:number, color?:string}>} items
 * @param {object} opts
 */
export function drawVBars(doc, x, y, w, h, items, opts = {}) {
  if (!items.length) return;
  const _sx = doc.x, _sy = doc.y;

  const axisColor      = opts.axisColor      ?? C.border;
  const barColor       = opts.barColor       ?? C.orange;
  const labelSize      = opts.labelSize      ?? 8;
  const valueSize      = opts.valueSize      ?? 8;
  const labelColor     = opts.labelColor     ?? C.muted;
  const gridLines      = opts.gridLines      ?? 4;
  const showValues     = opts.showValues     ?? true;
  const showYAxis      = opts.showYAxis      ?? true;
  const valueFormatter = opts.valueFormatter ?? ((v) => String(v));
  const yAxisFormatter = opts.yAxisFormatter ?? valueFormatter;

  const yAxisW  = showYAxis ? 44 : 0;
  const labelH  = labelSize + 6;
  const valueH  = showValues ? valueSize + 3 : 2;
  const chartX  = x + yAxisW;
  const chartW  = w - yAxisW;
  const chartH  = h - labelH - valueH;
  const chartY  = y + valueH;

  const maxVal = opts.maxVal ?? Math.max(...items.map((i) => i.value), 1);

  // Líneas de cuadrícula horizontales con etiquetas Y
  doc.save().strokeColor(axisColor).lineWidth(0.4).dash(2, { space: 3 });
  for (let g = 0; g <= gridLines; g++) {
    const gy = chartY + chartH - (g / gridLines) * chartH;
    doc.moveTo(chartX, gy).lineTo(chartX + chartW, gy).stroke();
  }
  doc.undash().restore();

  if (showYAxis) {
    for (let g = 0; g <= gridLines; g++) {
      const gy  = chartY + chartH - (g / gridLines) * chartH;
      const val = (g / gridLines) * maxVal;
      doc.save()
         .fillColor(labelColor).font("Helvetica").fontSize(labelSize - 1)
         .text(yAxisFormatter(val), x, gy - labelSize / 2, {
           width: yAxisW - 4, align: "right", lineBreak: false,
         })
         .restore();
    }
  }

  // Eje X
  doc.save().strokeColor(C.text).lineWidth(0.6)
     .moveTo(chartX, chartY + chartH).lineTo(chartX + chartW, chartY + chartH).stroke()
     .restore();

  const step = chartW / items.length;
  const barW = clamp(Math.floor(step * 0.6), 6, 36);

  items.forEach((item, i) => {
    const barH  = chartH * clamp(item.value / maxVal, 0, 1);
    const bx    = chartX + i * step + (step - barW) / 2;
    const by    = chartY + chartH - barH;
    const color = item.color ?? barColor;

    doc.save().rect(bx, by, barW, barH).fill(color).restore();

    if (showValues && item.value > 0) {
      doc.save()
         .fillColor(C.text).font("Helvetica-Bold").fontSize(valueSize)
         .text(valueFormatter(item.value), bx - 6, by - valueH + 1, {
           width: barW + 12, align: "center", lineBreak: false,
         })
         .restore();
    }

    const label = String(item.label ?? "");
    doc.save()
       .fillColor(labelColor).font("Helvetica").fontSize(labelSize)
       .text(label, bx - 8, chartY + chartH + 4, {
         width: barW + 16, align: "center", lineBreak: false, ellipsis: true,
       })
       .restore();
  });

  doc.x = _sx; doc.y = _sy;
}

// ── Barras Horizontales ───────────────────────────────────────────────────────

/**
 * Dibuja barras horizontales (ranking de productos, etc.).
 * @param {PDFDocument} doc
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {Array<{label:string, value:number, sub?:string, color?:string}>} items
 * @param {object} opts
 */
export function drawHBars(doc, x, y, w, h, items, opts = {}) {
  if (!items.length) return;
  const _sx = doc.x, _sy = doc.y;

  const barColor   = opts.barColor   ?? C.orange;
  const labelSize  = opts.labelSize  ?? 8;
  const valueSize  = opts.valueSize  ?? 8;
  const labelW     = opts.labelW     ?? Math.round(w * 0.42);
  const valueW     = opts.valueW     ?? 54;
  const barAreaW   = w - labelW - valueW - 8;
  const maxVal     = opts.maxVal ?? Math.max(...items.map((i) => i.value), 1);
  const rowH       = clamp(Math.floor(h / items.length), 14, 26);

  items.forEach((item, i) => {
    const ry     = y + i * rowH;
    const barH   = clamp(rowH - 8, 6, 14);
    const barLen = barAreaW * clamp(item.value / maxVal, 0, 1);
    const color  = item.color ?? barColor;

    const label = String(item.label ?? "");
    doc.save()
       .fillColor(C.text).font("Helvetica").fontSize(labelSize)
       .text(label, x, ry + (rowH - labelSize) / 2, { width: labelW, lineBreak: false, ellipsis: true })
       .restore();

    const bx = x + labelW + 4;
    const by = ry + (rowH - barH) / 2;

    // Pista de fondo gris suave
    doc.save().rect(bx, by, barAreaW, barH).fill(C.bg).restore();
    // Barra con valor
    doc.save().rect(bx, by, Math.max(barLen, 2), barH).fill(color).restore();

    doc.save()
       .fillColor(C.text).font("Helvetica-Bold").fontSize(valueSize)
       .text(String(item.sub ?? item.value), bx + barAreaW + 4, ry + (rowH - valueSize) / 2, {
         width: valueW, align: "right", lineBreak: false,
       })
       .restore();
  });

  doc.x = _sx; doc.y = _sy;
}

// ── Dona (Donut) ──────────────────────────────────────────────────────────────

/**
 * Dibuja una gráfica de dona.
 * @param {PDFDocument} doc
 * @param {number} cx  Centro X
 * @param {number} cy  Centro Y
 * @param {number} r   Radio exterior
 * @param {Array<{label:string, value:number, color:string}>} segments
 * @param {object} opts
 */
export function drawDonut(doc, cx, cy, r, segments, opts = {}) {
  const innerRatio = opts.innerRatio ?? 0.56;
  const innerR     = r * innerRatio;
  const bgColor    = opts.bg ?? C.white;
  const labelSize  = opts.labelSize ?? 7;
  const showLegend = opts.showLegend ?? true;
  const legendX    = opts.legendX ?? (cx + r + 14);
  const legendY    = opts.legendY ?? (cy - r * 0.6);

  const total = segments.reduce((s, seg) => s + Number(seg.value), 0);
  if (!total) {
    // Sin datos: círculo gris vacío
    doc.save().circle(cx, cy, r).fill(C.border).restore();
    doc.save().circle(cx, cy, innerR).fill(bgColor).restore();
    return;
  }

  let angle = -Math.PI / 2; // empieza en la parte superior

  segments.forEach((seg) => {
    const pct = Number(seg.value) / total;
    if (pct < 0.001) return;
    const sweep = pct * 2 * Math.PI;

    if (pct > 0.999) {
      // Sector completo → dibujar círculo completo
      doc.save().circle(cx, cy, r).fill(seg.color).restore();
    } else {
      const endAngle = angle + sweep;
      doc.save().path(sectorPath(cx, cy, r, angle, endAngle)).fill(seg.color).restore();
      angle += sweep;
    }
  });

  // Hueco interior (dona)
  doc.save().circle(cx, cy, innerR).fill(bgColor).restore();

  // Total centrado en el hueco
  if (opts.centerLabel) {
    const textY = cy - (opts.centerSize ?? 11) / 2 - 1;
    doc.save()
       .fillColor(opts.centerColor ?? C.text)
       .font("Helvetica-Bold").fontSize(opts.centerSize ?? 11)
       .text(opts.centerLabel, cx - innerR, textY, { width: innerR * 2, align: "center", lineBreak: false })
       .restore();
    if (opts.centerSub) {
      doc.save()
         .fillColor(C.muted).font("Helvetica").fontSize((opts.centerSize ?? 11) - 3)
         .text(opts.centerSub, cx - innerR, textY + (opts.centerSize ?? 11) + 1, {
           width: innerR * 2, align: "center", lineBreak: false,
         })
         .restore();
    }
  }

  // Leyenda lateral
  if (showLegend) {
    const dotR   = 5;
    const rowH   = labelSize + 8;
    segments.forEach((seg, i) => {
      const ly = legendY + i * rowH;
      doc.save().circle(legendX + dotR, ly + dotR, dotR).fill(seg.color).restore();
      const pct = total ? ((seg.value / total) * 100).toFixed(0) : 0;
      doc.save()
         .fillColor(C.text).font("Helvetica").fontSize(labelSize)
         .text(`${seg.label} ${pct}%`, legendX + dotR * 2 + 5, ly + 1, { lineBreak: false })
         .restore();
    });
  }
}
