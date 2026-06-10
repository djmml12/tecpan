// ── Paleta Tecpancito — espeja tokens.css del POS ────────────────────────────
// Fuente de verdad: packages/ui-kit/src/tokens.css

export const C = {
  // Acento (mostaza) — --accent / --tecpan-yellow
  orange:        "#E8A813",   // --accent
  orangeLight:   "#FBE3A4",   // --accent-soft
  orangeMuted:   "#FFF6D6",   // tint suave de accent-soft para fondos
  orangeDeep:    "#B5810A",   // --accent-deep
  accentInk:     "#2B1608",   // --accent-ink (texto sobre mostaza)

  // Superficies crema — --bg-* / --tecpan-cream
  bg:            "#F8F2DD",   // --bg-elev
  bgSoft:        "#F4ECD8",   // --bg-soft / --tecpan-cream
  bgDeeper:      "#DECFAE",   // --bg-deeper

  // Texto marrón — --fg-*
  text:          "#2B1608",   // --fg-1 / --tecpan-brown-dark
  textMid:       "#5C4528",   // --fg-2
  muted:         "#8A7456",   // --fg-3
  subtle:        "#B0A180",   // --fg-4

  // Sidebar / header oscuro
  brownDark:     "#2B1608",   // --tecpan-brown-dark
  cream:         "#F4ECD8",   // --tecpan-cream

  // Borde
  border:        "#E8DCBE",   // --tecpan-cream-deep
  white:         "#FFFFFF",

  // Estado crítico — --rec
  critical:      "#B33A1F",
  criticalBg:    "#F4C9BA",   // --rec-soft
  criticalBorder:"#D9583A",

  // Estado bajo — --warn
  low:           "#D67A1A",   // --warn
  lowBg:         "#FAD8AC",   // --warn-soft
  lowBorder:     "#E89640",

  // Estado ok — --ok
  ok:            "#6A8E3F",
  okBg:          "#D6E2B9",   // --ok-soft
  okBorder:      "#9CB874",

  // Extras (mantenidos por compatibilidad con stock-alert)
  blue:          "#1D4ED8",
  blueBg:        "#DBEAFE",
  blueBorder:    "#93C5FD",
  purple:        "#7C3AED",
  purpleBg:      "#EDE9FE",
  purpleBorder:  "#C4B5FD",
};

// Dimensiones carta 612×792pt (US Letter)
export const LETTER = {
  width:       612,
  height:      792,
  marginX:     48,
  marginY:     48,
  contentW:    612 - 48 * 2,   // 516
  headerH:     72,
  footerH:     36,
  logoW:       110,
  logoH:       36,
  titleSize:   18,
  subtitleSize:11,
  headingSize: 13,
  bodySize:    9,
  tableSize:   9,
  labelSize:   8,
  kpiH:        58,
  kpiGap:      10,
  rowH:        20,
  tableRowH:   18,
  sectionGap:  14,
};

// Dimensiones móvil 420×740pt (una sola página)
export const MOBILE = {
  width:        420,
  height:       740,
  paddingX:     18,
  contentW:     420 - 18 * 2,  // 384
  headerH:      72,
  kpiMainH:     95,
  kpisRowH:     68,
  chartH:       152,
  detailH:      228,
  footerH:      55,
  titleSize:    15,
  subtitleSize: 10,
  bodySize:     9,
  labelSize:    7,
  kpiValueSize: 22,
  kpiLabelSize: 8,
  detailRowH:   19,
};

// ── Formateadores usando la zona horaria local de Windows ─────────────────────

const LOCALE = "es-GT";

function _toDate(s) {
  if (!s) return null;
  // soporta "2024-05-08 14:30:00" y "2024-05-08T14:30:00"
  return new Date(String(s).replace(" ", "T"));
}

export const fmt = {
  currency(n) {
    const val = Number(n || 0);
    const parts = val.toFixed(2).split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `Q ${parts.join(".")}`;
  },
  number(n) {
    return Number(n || 0).toLocaleString(LOCALE);
  },
  percent(n, decimals = 1) {
    return `${Number(n || 0).toFixed(decimals)}%`;
  },
  date(s) {
    const d = _toDate(s);
    if (!d || isNaN(d)) return String(s || "—").slice(0, 10);
    return d.toLocaleDateString(LOCALE, {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
  },
  datetime(s) {
    const d = _toDate(s);
    if (!d || isNaN(d)) return String(s || "—").slice(0, 16);
    return d.toLocaleString(LOCALE, {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  },
  today() {
    return new Date().toLocaleDateString(LOCALE, {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
  },
  todayFull() {
    return new Date().toLocaleString(LOCALE, {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  },
};
