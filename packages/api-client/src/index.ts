/**
 * API base URL — resolución en orden de prioridad:
 *   1. URL provista por Electron via IPC (puerto real elegido en arranque)
 *   2. VITE_API_URL env var (builds de producción con URL fija)
 *   3. Same-origin para deploys web con proxy (nginx / Vite dev)
 *   4. Mismo hostname + puerto 3000 como fallback para file://
 */

type ElectronAPI = { getBackendUrl?: () => Promise<string> };

let _resolvedBase: string | null = null;

async function resolveApiBase(): Promise<string> {
  if (_resolvedBase !== null) return _resolvedBase;

  // Electron: pedir la URL al proceso principal (incluye el puerto real elegido)
  const eAPI = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;
  if (eAPI?.getBackendUrl) {
    try {
      const url = await eAPI.getBackendUrl();
      if (url) { _resolvedBase = url.replace(/\/+$/, ""); return _resolvedBase; }
    } catch {}
  }

  // Env var explícita (builds web de producción)
  const configuredApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (configuredApiUrl) { _resolvedBase = configuredApiUrl.replace(/\/+$/, ""); return _resolvedBase; }

  // Protocolo file:// sin IPC (modo dev del shell, sin Electron completo)
  if (window.location.protocol === "file:") {
    const hostname = window.location.hostname || "127.0.0.1";
    _resolvedBase = `http://${hostname}:3000`;
    return _resolvedBase;
  }

  // Web: same-origin (Vite proxy en dev, nginx en producción)
  _resolvedBase = "";
  return _resolvedBase;
}

/** Devuelve la URL base del backend ya resuelta (útil para mostrarla en UI). */
export async function getBackendBaseUrl(): Promise<string> {
  return resolveApiBase();
}

export const apiRequest = async (endpoint: string, options: RequestInit & { timeoutMs?: number } = {}) => {
  const base     = await resolveApiBase();
  const token    = localStorage.getItem("token");
  const controller = new AbortController();
  const timeoutMs  = options.timeoutMs ?? 30_000;
  const timeoutId  = window.setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> ?? {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${base}/api${endpoint}`, {
      ...options,
      headers,
      signal: options.signal ?? controller.signal,
    });

    const contentType = response.headers.get("content-type") ?? "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : null;

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem("token");
        // Avisar a la app para que cierre sesión limpiamente (evita estado zombie).
        try { window.dispatchEvent(new CustomEvent("auth:unauthorized")); } catch { /* no-op */ }
      }
      throw new Error((data as { message?: string })?.message ?? "API error");
    }

    return data as unknown;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Tiempo de espera agotado con el backend");
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
};
