/* ============================================================
   @pos/pos-core — Lógica de POS compartida (tablet + mobile)
   Hooks de catálogo, multi-ticket, cobro, órdenes e impresión,
   más utilidades de formato. Toda la I/O pasa por @pos/api-client.
   ============================================================ */

export * from "./utils";
export * from "./types";

export { useCatalog }     from "./hooks/useCatalog";
export { useMultiTicket } from "./hooks/useMultiTicket";
export { useCheckout }    from "./hooks/useCheckout";
export { useOrders }      from "./hooks/useOrders";
export { usePrinting }    from "./hooks/usePrinting";

export type { LoadOrderArgs }            from "./hooks/useMultiTicket";
export type { CheckoutPayload, PayResult } from "./hooks/useCheckout";
