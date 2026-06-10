// ── Paleta y constantes de diseño para todos los PDFs ────────────────────────

export const C = {
  orange:        "#E97316",
  orangeLight:   "#FED7AA",
  orangeMuted:   "#FFF7ED",
  text:          "#111827",
  muted:         "#6B7280",
  border:        "#E5E7EB",
  bg:            "#F9FAFB",
  white:         "#FFFFFF",
  critical:      "#B91C1C",
  criticalBg:    "#FEE2E2",
  criticalBorder:"#FCA5A5",
  low:           "#A16207",
  lowBg:         "#FEF3C7",
  lowBorder:     "#FCD34D",
  ok:            "#166534",
  okBg:          "#DCFCE7",
  okBorder:      "#86EFAC",
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
