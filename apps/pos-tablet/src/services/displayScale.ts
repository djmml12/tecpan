/* ============================================================
   displayScale — escala de render del POS (zoom de interfaz)

   Por-dispositivo: cada tablet tiene su propia resolución/DPI,
   por eso se persiste en localStorage (no en el backend, que es
   global y forzaría una escala equivocada en otros equipos).

   Implementado con la propiedad CSS `zoom` sobre el <html>:
   Chromium (Electron + Edge/WebView) reescala todo el árbol de
   render de forma nítida — equivale a Ctrl + / Ctrl - del navegador.
   ============================================================ */

const STORAGE_KEY = "tecpan-display-scale";

export const SCALE_MIN = 0.5;
export const SCALE_MAX = 1.5;
export const SCALE_STEP = 0.05;

/** Redondea a 2 decimales y acota al rango permitido. */
export const clampScale = (v: number): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  const rounded = Math.round(n * 100) / 100;
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, rounded));
};

/** Lee la escala persistida (1 = 100% si no hay valor). */
export const getScale = (): number => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return 1;
    return clampScale(Number(raw));
  } catch {
    return 1;
  }
};

/** Aplica la escala al DOM mediante la variable CSS `--ui-scale`.
    El `.tecpan` se dimensiona inverso a la escala y se reduce con
    `transform: scale()`, de modo que SIEMPRE llena el viewport pero
    su contenido se renderiza más grande o más pequeño. */
export const applyScale = (scale: number): void => {
  document.documentElement.style.setProperty("--ui-scale", String(clampScale(scale)));
};

const listeners = new Set<() => void>();

/** Persiste, aplica y notifica a los suscriptores. */
export const setScale = (v: number): void => {
  const scale = clampScale(v);
  try {
    localStorage.setItem(STORAGE_KEY, String(scale));
  } catch {
    /* ignore */
  }
  applyScale(scale);
  listeners.forEach((l) => l());
};

export const subscribe = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

/** Aplica la escala guardada. Llamar una vez al arrancar la app. */
export const initDisplayScale = (): void => {
  applyScale(getScale());
};
