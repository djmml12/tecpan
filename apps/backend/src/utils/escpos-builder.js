import { buildEscPosLogoBytes } from "./escpos-logo.js";

/* ─────────────────────────────────────────────────────────────────────────────
 * ESC/POS builder for thermal printers (Rongta, Epson, Xprinter, etc.)
 *
 * Resolution assumed: 203 dpi  →  8 dots / mm (standard for ESC/POS thermals)
 * Print area in dots:
 *   58 mm paper →  384 dots
 *   80 mm paper →  576 dots
 *
 * Margins are applied via NATIVE hardware commands (precise, work for raster
 * logos and centered text alike):
 *   - Left margin:           GS L  nL nH    (dots from paper edge)
 *   - Print area width:      GS W  nL nH    (dots, defines right boundary)
 *   - Top / bottom feed:     ESC J n        (dots ≈ 0.125 mm each)
 *
 * Character cell (Font A): 12 dots wide × 24 dots tall.
 *   80 mm: 576 / 12 = 48 chars per line.
 *   58 mm: 384 / 12 = 32 chars per line.
 * Content width is recomputed from the (possibly reduced) print area.
 * ──────────────────────────────────────────────────────────────────────────── */

const DOTS_PER_MM           = 8;
const CHAR_WIDTH_DOTS       = 12;
const VERTICAL_UNIT_MM      = 1 / 8; // ESC J unit = 1/203" ≈ 0.125 mm (forzado vía GS P 203 203 en prelude)
// Printable dot count varies by printer head: nominal paper width minus the
// ~4mm physical margin imposed by the platen on each side.
// 58mm: bajado de 384 → 360 porque la Gainscha GP-58N (y la mayoría de los
// clones 58mm: Rongta, Xprinter, EPPOS) corta los últimos 2 caracteres cuando
// se intenta llenar los 384 dots completos. 360 dots = 30 chars seguros.
// Si tu impresora soporta los 384 dots reales, pon printable_dots_override=384
// en la config (settings.printer_config) para recuperarlos.
const PRINTABLE_DOTS_80MM   = 576; // 72 mm usable
const PRINTABLE_DOTS_58MM   = 360; // 45 mm usable — Gainscha 58N effective area
// Distancia física entre cabezal térmico y cuchilla. Se suma al margin_bottom_mm
// para que el último renglón impreso no quede dentro del corte.
const CUTTER_FEED_MM        = 12;

const stripAccents = (value) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/×/g, "x");

const sanitizeText = (value) =>
  stripAccents(String(value || ""))
    .replace(/[^\x20-\x7E\n]/g, "")
    .trimEnd();

const encodeText = (value) => {
  const encoder = new TextEncoder();
  return Array.from(encoder.encode(sanitizeText(value)));
};

const wrapText = (value, width) => {
  const clean = sanitizeText(value).trim();
  if (!clean) return [""];

  const words = clean.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    if (!current) { current = word; continue; }
    if (`${current} ${word}`.length <= width) { current = `${current} ${word}`; continue; }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
};

const pairLine = (left, right, width) => {
  const leftClean  = sanitizeText(left);
  const rightClean = sanitizeText(right);
  const space = Math.max(1, width - leftClean.length - rightClean.length);
  return `${leftClean}${" ".repeat(space)}${rightClean}`;
};

const divider = (width) => "-".repeat(width);

/** Pad a string to be visually centered within `width` chars (software centering). */
const centerPad = (line, width) => {
  const len = sanitizeText(line).length;
  return " ".repeat(Math.max(0, Math.floor((width - len) / 2))) + line;
};

/* ── Native ESC/POS commands ─────────────────────────────────────────────── */

const initializeCommands = () => [27, 64];          // ESC @
const codePageCP858      = () => [27, 116, 19];     // ESC t 19 (CP858, multi-byte safe set)
const boldOn             = () => [27, 69, 1];
const boldOff            = () => [27, 69, 0];
const centerAlign        = () => [27, 97, 1];
const leftAlign          = () => [27, 97, 0];
const cut                = () => [29, 86, 66, 0];   // GS V B 0 (partial cut + feed)

/** GS L nL nH — left margin in dots (origin shift) */
const setLeftMarginDots = (dots) => {
  const n = Math.max(0, Math.min(65535, Math.round(dots)));
  return [29, 76, n & 0xff, (n >> 8) & 0xff];
};

/** GS W nL nH — print-area width in dots (defines effective line width) */
const setPrintAreaWidthDots = (dots) => {
  const n = Math.max(8, Math.min(65535, Math.round(dots)));
  return [29, 87, n & 0xff, (n >> 8) & 0xff];
};

/** ESC J n — feed n vertical motion units (≈ 0.125 mm each) */
const feedDots = (dots) => {
  const out = [];
  let remaining = Math.max(0, Math.round(dots));
  while (remaining > 0) {
    const chunk = Math.min(255, remaining);
    out.push(27, 74, chunk);
    remaining -= chunk;
  }
  return out;
};

const feedMm = (mm) => feedDots(Math.max(0, Number(mm) || 0) / VERTICAL_UNIT_MM);

const pushLine = (buffer, line = "") => {
  buffer.push(...encodeText(line), 10);
};

/* ── Config resolution ───────────────────────────────────────────────────── */

const resolveConfig = (printerConfig = {}) => {
  const widthMm      = Number(printerConfig.width_mm) === 58 ? 58 : 80;
  const defaultDots  = widthMm === 58 ? PRINTABLE_DOTS_58MM : PRINTABLE_DOTS_80MM;
  // printable_dots_override permite ajustar modelos Rongta no-estándar (ej. 360 dots en 58mm)
  const totalDots    = printerConfig.printable_dots_override
    ? Math.max(192, Math.min(65535, Number(printerConfig.printable_dots_override)))
    : defaultDots;

  const leftMm   = Math.max(0, Number(printerConfig.margin_left_mm)   || 0);
  const rightMm  = Math.max(0, Number(printerConfig.margin_right_mm)  || 0);
  const topMm    = printerConfig.margin_top_mm    != null
    ? Math.max(0, Number(printerConfig.margin_top_mm))    : 1;
  const bottomMm = printerConfig.margin_bottom_mm != null
    ? Math.max(0, Number(printerConfig.margin_bottom_mm)) : 3;

  const leftDots  = Math.round(leftMm  * DOTS_PER_MM);
  const rightDots = Math.round(rightMm * DOTS_PER_MM);

  // Reserve at least ~16 chars (16 × 12 = 192 dots) so output never collapses
  const minPrintAreaDots = 16 * CHAR_WIDTH_DOTS;
  const printAreaDots = Math.max(
    minPrintAreaDots,
    totalDots - leftDots - rightDots,
  );

  // Recompute usable left if right pushed the floor
  const effectiveLeftDots = Math.min(leftDots, totalDots - printAreaDots);

  const contentWidth = Math.max(16, Math.floor(printAreaDots / CHAR_WIDTH_DOTS));

  // Software left margin: number of space chars to prepend on every text line.
  // Avoids relying on GS L which many 58mm clone printers silently ignore.
  const leftChars = Math.floor(effectiveLeftDots / CHAR_WIDTH_DOTS);
  const leftPad   = " ".repeat(leftChars);

  // Logo ancho en múltiplo de 8: evita bytes residuales en GS v 0 que algunos
  // firmwares Rongta truncan o desplazan en el lado derecho del logo.
  const logoDots = Math.floor(printAreaDots / 8) * 8;

  return {
    widthMm: String(widthMm),
    totalDots,
    leftDots: effectiveLeftDots,
    printAreaDots,
    contentWidth,
    leftChars,
    leftPad,
    topMm,
    bottomMm,
    logoDots,
  };
};

/** Emit the standard prelude: init + code page + margins + top feed.
 *
 * Hardware margin commands (GS L / GS W) are intentionally set to neutral
 * values (left=0, width=full paper) because many 58mm clone printers silently
 * ignore GS L.  Left and right margins are applied in software by prepending
 * spaces (cfg.leftPad) and limiting line width to cfg.contentWidth.
 */
const pushPrelude = (bytes, cfg) => {
  bytes.push(
    ...initializeCommands(),                  // ESC @ — must come first (resets margins)
    ...codePageCP858(),
    29, 80, 203, 203,                         // GS P x y — fija motion units a 1/203" (8 dots/mm)
    ...setLeftMarginDots(0),                  // GS L = 0  (software margin via spaces instead)
    ...setPrintAreaWidthDots(cfg.totalDots),  // GS W = full paper (right limit via contentWidth)
    ...feedMm(cfg.topMm),                     // ESC J × n  (top margin — ESC J always works)
  );
};

const pushHeaderBlock = async (bytes, printerConfig, cfg) => {
  if (printerConfig.logo_data_url) {
    try {
      const rawPct     = Number(printerConfig.logo_size_pct);
      const sizePct    = Number.isFinite(rawPct) ? Math.min(100, Math.max(30, rawPct)) : 100;
      // Mantener múltiplo de 8 para que GS v 0 no trunque bytes residuales.
      const scaledDots = Math.max(8, Math.floor((cfg.logoDots * sizePct) / 100 / 8) * 8);
      // Center the logo within the software content area (between leftDots and
      // totalDots - rightDots) by pre-padding the raster with white pixels on
      // the left.  This bakes the position into the bitmap, so it does not rely
      // on GS L / ESC a, which many 58mm clones (incl. Gainscha GP-58N) ignore.
      const paddingDots = cfg.leftDots + Math.max(0, Math.floor((cfg.printAreaDots - scaledDots) / 2));
      const logoBytes   = await buildEscPosLogoBytes(printerConfig.logo_data_url, scaledDots, paddingDots);
      if (logoBytes.length > 0) {
        bytes.push(...leftAlign(), ...logoBytes, 10);
      }
    } catch { /* skip logo on error */ }
  }

  const headerRaw = sanitizeText(printerConfig.header_text ?? "");
  if (headerRaw) {
    headerRaw.split("\n").forEach((line) => {
      if (line.trim()) pushLine(bytes, cfg.leftPad + centerPad(line.trim(), cfg.contentWidth));
    });
  }
};

const pushFooterBlock = (bytes, printerConfig, cfg) => {
  const footerRaw = sanitizeText(printerConfig.footer_text ?? "");
  if (!footerRaw) return;
  footerRaw.split("\n").forEach((line) => {
    if (line.trim()) pushLine(bytes, cfg.leftPad + centerPad(line.trim(), cfg.contentWidth));
  });
};

/* ── Sales Range Summary ─────────────────────────────────────────────────── */

export const buildEscPosSalesRangeSummaryBytes = async (summary, printerConfig = {}) => {
  const cfg = resolveConfig(printerConfig);
  const { contentWidth, bottomMm, leftPad } = cfg;
  const bytes = [];
  const isMultiDay = summary.from !== summary.to;

  const fmtMoney = (n) => `Q${Number(n || 0).toFixed(2)}`;
  const fmtDate  = (d) => {
    const parts = String(d ?? "").split("-");
    return parts.length === 3 ? `${parts[2]}/${parts[1]}` : String(d ?? "");
  };
  const pl = (line) => pushLine(bytes, leftPad + line);
  const pc = (line) => pushLine(bytes, leftPad + centerPad(line, contentWidth));

  pushPrelude(bytes, cfg);
  await pushHeaderBlock(bytes, printerConfig, cfg);

  bytes.push(...boldOn());
  pc("RESUMEN DE VENTAS");
  bytes.push(...boldOff());

  const subtitle = isMultiDay
    ? `${summary.from} al ${summary.to}`
    : String(summary.from ?? "");
  pc(subtitle);
  pl(divider(contentWidth));

  const colHeader = isMultiDay
    ? pairLine("FECHA  #VENTA  TOTAL", "PROPINA", contentWidth)
    : pairLine("#VENTA   TOTAL", "PROPINA", contentWidth);
  pl(colHeader);
  pl(divider(contentWidth));

  if (!summary.sales || summary.sales.length === 0) {
    pl("Sin ventas en el periodo.");
  } else {
    for (const sale of summary.sales) {
      const left = isMultiDay
        ? `${fmtDate(sale.date)} #${sale.monthly_number ?? sale.id} ${fmtMoney(sale.total)}`
        : `#${sale.monthly_number ?? sale.id}  ${fmtMoney(sale.total)}`;
      const right = fmtMoney(sale.tip ?? 0);
      pl(pairLine(left, right, contentWidth));
    }
  }

  pl(divider(contentWidth));
  bytes.push(...boldOn());
  pl(pairLine("Ventas:",   fmtMoney(summary.total_sales_amount), contentWidth));
  pl(pairLine("Propinas:", fmtMoney(summary.total_tips),         contentWidth));
  pl(pairLine("TOTAL:",    fmtMoney(summary.total_collected),    contentWidth));
  bytes.push(...boldOff());
  pl(divider(contentWidth));

  const count = (summary.sales ?? []).length;
  pc(`${count} ventas`);

  pushFooterBlock(bytes, printerConfig, cfg);

  bytes.push(...feedMm(bottomMm + CUTTER_FEED_MM), ...cut());
  return bytes;
};

/* ── Daily Sales Summary ─────────────────────────────────────────────────── */

export const buildEscPosDailySalesSummaryBytes = async (summary, printerConfig = {}) => {
  const cfg = resolveConfig(printerConfig);
  const { contentWidth, bottomMm, leftPad } = cfg;
  const bytes = [];

  const fmtMoney = (n) => `Q${Number(n || 0).toFixed(2)}`;
  const pl = (line) => pushLine(bytes, leftPad + line);
  const pc = (line) => pushLine(bytes, leftPad + centerPad(line, contentWidth));

  pushPrelude(bytes, cfg);
  await pushHeaderBlock(bytes, printerConfig, cfg);

  bytes.push(...boldOn());
  pc("RESUMEN VENTAS DEL DIA");
  bytes.push(...boldOff());
  pc(String(summary.date ?? ""));
  pl(divider(contentWidth));

  pl(pairLine("#VENTA  TOTAL", "PROPINA", contentWidth));
  pl(divider(contentWidth));

  if (!summary.sales || summary.sales.length === 0) {
    pl("Sin ventas hoy.");
  } else {
    for (const sale of summary.sales) {
      const left  = `#${sale.monthly_number ?? sale.id}  ${fmtMoney(sale.total)}`;
      const right = fmtMoney(sale.tip ?? 0);
      pl(pairLine(left, right, contentWidth));
    }
  }

  pl(divider(contentWidth));
  bytes.push(...boldOn());
  pl(pairLine("Ventas:",    fmtMoney(summary.total_sales_amount), contentWidth));
  pl(pairLine("Propinas:",  fmtMoney(summary.total_tips),         contentWidth));
  pl(pairLine("TOTAL DIA:", fmtMoney(summary.total_collected),    contentWidth));
  bytes.push(...boldOff());
  pl(divider(contentWidth));

  pc(`${(summary.sales ?? []).length} ventas`);

  pushFooterBlock(bytes, printerConfig, cfg);

  bytes.push(...feedMm(bottomMm + CUTTER_FEED_MM), ...cut());
  return bytes;
};

/* ── Kitchen Ticket ──────────────────────────────────────────────────────── */

export const buildEscPosKitchenTicketBytes = (ticket, printerConfig = {}) => {
  const cfg = resolveConfig(printerConfig);
  const { contentWidth, bottomMm, leftPad } = cfg;
  const bytes = [];
  const pl = (line) => pushLine(bytes, leftPad + line);
  const pc = (line) => pushLine(bytes, leftPad + centerPad(line, contentWidth));

  pushPrelude(bytes, cfg);

  bytes.push(...boldOn());
  if (ticket.reference) {
    wrapText(ticket.reference, contentWidth).forEach((line) => pc(line));
  }
  bytes.push(...boldOff());

  if (ticket.created_at) {
    pl(new Date(ticket.created_at).toLocaleString());
  }

  pl(divider(contentWidth));

  if (ticket.notes) {
    bytes.push(...boldOn());
    wrapText(`NOTA: ${ticket.notes}`, Math.max(8, contentWidth - 2)).forEach((line) => pl(line));
    bytes.push(...boldOff());
    pl(divider(contentWidth));
  }

  if (!ticket.items || ticket.items.length === 0) {
    pl("SIN PRODUCTOS");
  } else {
    ticket.items.forEach((item) => {
      const qty = Number(item.quantity || 0);
      wrapText(String(item.name || ""), Math.max(8, contentWidth - 4)).forEach((line, index, lines) => {
        const qtyStr = index === lines.length - 1 ? `x${qty}` : "";
        pl(pairLine(line, qtyStr, contentWidth));
      });
      if (item.notes) {
        bytes.push(...boldOn());
        wrapText(`>> ${item.notes}`, Math.max(6, contentWidth - 4)).forEach((line) => pl(line));
        bytes.push(...boldOff());
      }
    });
  }

  pl(divider(contentWidth));
  bytes.push(...feedMm(bottomMm + CUTTER_FEED_MM), ...cut());

  return bytes;
};

/* ── Sale Receipt ────────────────────────────────────────────────────────── */

export const buildEscPosReceiptBytes = async (sale, printerConfig = {}) => {
  const cfg = resolveConfig(printerConfig);
  const { contentWidth, bottomMm, leftPad } = cfg;
  const bytes = [];

  const fmtMoney = (n) => `Q${Number(n || 0).toFixed(2)}`;
  const fmtDate  = (d) => {
    try { return new Date(d).toLocaleString("es-GT"); }
    catch { return String(d ?? ""); }
  };
  const pl = (line) => pushLine(bytes, leftPad + line);
  const pc = (line) => pushLine(bytes, leftPad + centerPad(line, contentWidth));

  pushPrelude(bytes, cfg);
  await pushHeaderBlock(bytes, printerConfig, cfg);

  bytes.push(...boldOn());
  pc(`ORDEN #${sale.monthly_number ?? sale.id}`);
  bytes.push(...boldOff());

  if (sale.reference) {
    pc(sale.reference);
  }

  pl(fmtDate(sale.created_at));
  if (sale.user_name) pl(`Atendio: ${sanitizeText(sale.user_name)}`);
  pl(divider(contentWidth));

  const items = sale.items ?? [];
  if (items.length === 0) {
    pl("Sin productos");
  } else {
    for (const item of items) {
      const qty      = Number(item.quantity || 1);
      const price    = Number(item.price_at_sale || item.price || 0);
      const subtotal = fmtMoney(qty * price);
      const nameLine = pairLine(
        `${qty}x ${sanitizeText(item.name || "")}`.slice(0, contentWidth - subtotal.length - 1),
        subtotal,
        contentWidth,
      );
      pl(nameLine);
      if (item.notes) {
        pl(`  >> ${sanitizeText(item.notes)}`);
      }
    }
  }

  pl(divider(contentWidth));

  const tipAmt = Number(sale.tip_amount || 0);
  if (tipAmt > 0) {
    pl(pairLine("Subtotal:", fmtMoney(sale.total), contentWidth));
    pl(pairLine(`Propina (${sale.tip_percentage ?? 0}%):`, fmtMoney(tipAmt), contentWidth));
  }
  bytes.push(...boldOn());
  pl(pairLine("TOTAL:", fmtMoney(Number(sale.total || 0) + tipAmt), contentWidth));
  bytes.push(...boldOff());

  if (sale.notes) {
    pl(divider(contentWidth));
    wrapText(`Nota: ${sale.notes}`, contentWidth).forEach((line) => pl(line));
  }

  pushFooterBlock(bytes, printerConfig, cfg);

  bytes.push(...feedMm(bottomMm + CUTTER_FEED_MM), ...cut());
  return bytes;
};

/* ── Logout compact summary ──────────────────────────────────────────────── */

export const buildEscPosLogoutCompactBytes = (summary, printerConfig = {}) => {
  const cfg = resolveConfig(printerConfig);
  const { contentWidth, leftPad } = cfg;
  const bytes = [];

  const fmtMoney = (n) => `Q${Number(n || 0).toFixed(2)}`;
  const pl = (line) => pushLine(bytes, leftPad + line);
  const pc = (line) => pushLine(bytes, leftPad + centerPad(line, contentWidth));

  pushPrelude(bytes, cfg);

  bytes.push(...boldOn());
  pc(`RESUMEN ${String(summary.from ?? summary.date ?? "")}`);
  bytes.push(...boldOff());
  pl(divider(contentWidth));

  if (!summary.sales || summary.sales.length === 0) {
    pl("Sin ventas.");
  } else {
    const half = Math.floor(contentWidth / 2) - 1;
    let col = 0;
    let rowBuf = "";
    for (const sale of summary.sales) {
      const entry = `#${sale.monthly_number ?? sale.id} ${fmtMoney(sale.total)}`;
      if (col === 0) {
        rowBuf = entry.padEnd(half);
        col = 1;
      } else {
        pl(`${rowBuf} ${entry}`);
        rowBuf = "";
        col = 0;
      }
    }
    if (col === 1) pl(rowBuf.trimEnd());
  }

  pl(divider(contentWidth));
  bytes.push(...boldOn());
  pl(pairLine("VENTAS:",   fmtMoney(summary.total_sales_amount), contentWidth));
  pl(pairLine("PROPINAS:", fmtMoney(summary.total_tips),         contentWidth));
  pl(pairLine("TOTAL:",    fmtMoney(summary.total_collected),    contentWidth));
  bytes.push(...boldOff());

  pc(`${(summary.sales ?? []).length} ventas`);

  bytes.push(...feedMm(CUTTER_FEED_MM), ...cut());
  return bytes;
};

/* ── Test page ───────────────────────────────────────────────────────────── */
/* Exposed so print.controller.js can build a margin-aware test print without
 * duplicating the prelude logic. */

export const buildEscPosTestPageBytes = (printerConfig = {}, info = {}) => {
  const cfg = resolveConfig(printerConfig);
  const { contentWidth, bottomMm, leftPad } = cfg;
  const bytes = [];
  const pl = (line) => pushLine(bytes, leftPad + line);
  const pc = (line) => pushLine(bytes, leftPad + centerPad(line, contentWidth));

  pushPrelude(bytes, cfg);

  bytes.push(...boldOn());
  pc("PRUEBA DE IMPRESION");
  bytes.push(...boldOff());
  pc("Tecpancito");
  pl(divider(contentWidth));

  if (info.now)        pl(`Fecha:    ${info.now}`);
  pl(`Papel:    ${cfg.widthMm} mm (${cfg.totalDots} dots)`);
  pl(`Margenes: I=${(cfg.leftDots / DOTS_PER_MM).toFixed(1)}mm (${cfg.leftChars}ch)  D=${((cfg.totalDots - cfg.leftDots - cfg.printAreaDots) / DOTS_PER_MM).toFixed(1)}mm`);
  pl(`          T=${cfg.topMm}mm  B=${cfg.bottomMm}mm`);
  pl(`Ancho:    ${contentWidth} caracteres`);
  if (info.connection) pl(`Conexion: ${info.connection}`);
  pl(divider(contentWidth));

  // Visual ruler: preceded by leftPad so the operator can verify the indent visually
  const ruler = Array.from({ length: contentWidth }, (_, i) => String((i + 1) % 10)).join("");
  pl(ruler);

  pc("** Impresora OK **");

  bytes.push(...feedMm(bottomMm + CUTTER_FEED_MM), ...cut());
  return bytes;
};
