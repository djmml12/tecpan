import { useEffect, useReducer } from "react";

export type Theme = "dark" | "light";

const KEY = "pos-mobile-theme";

function read(): Theme {
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

let current: Theme = read();
const listeners = new Set<() => void>();

function apply(theme: Theme) {
  const el = document.documentElement;
  /* Activa el sistema de tokens Tecpancito (.tecpan) y alterna el modo
     oscuro (.tecpan-dark), igual que el pos-tablet. Mantiene data-theme
     por compatibilidad con cualquier estilo que aún lo consulte. */
  el.classList.add("tecpan");
  el.classList.toggle("tecpan-dark", theme === "dark");
  el.dataset.theme = theme;
}

/* Aplica el tema persistido en cuanto se importa el módulo (antes del render). */
apply(current);

export function setTheme(theme: Theme) {
  current = theme;
  try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
  apply(theme);
  listeners.forEach(fn => fn());
}

export function toggleTheme() {
  setTheme(current === "dark" ? "light" : "dark");
}

/** Suscribe el componente al tema global y expone el toggle. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => { listeners.delete(force); };
  }, []);
  return { theme: current, toggle: toggleTheme };
}
