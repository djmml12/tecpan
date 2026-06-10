/* Formato de moneda GTQ — debe coincidir con el backend. */
export const fmt = (n: number): string =>
  new Intl.NumberFormat("es-GT", {
    style: "currency",
    currency: "GTQ",
    minimumFractionDigits: 2,
  }).format(n);

/** Convierte number | string | null en number seguro. */
export const toNum = (v: number | string | undefined | null): number =>
  typeof v === "string" ? parseFloat(v) || 0 : (v ?? 0);

/** Redondeo a 2 decimales (GTQ). Debe coincidir con money() del backend. */
export const money = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;
