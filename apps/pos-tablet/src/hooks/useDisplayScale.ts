import { useSyncExternalStore } from "react";
import { getScale, subscribe } from "../services/displayScale";

/** Escala de render actual (reactiva ante cambios desde cualquier vista). */
export function useDisplayScale(): number {
  return useSyncExternalStore(subscribe, getScale, getScale);
}
