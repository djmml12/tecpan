import type { CartItem } from "@pos/types";

/* Re-export de los tipos compartidos para que los consumidores
   puedan importarlos desde un solo lugar (@pos/pos-core). */
export type { CartItem, Product, Category, SavedOrder, PaidSale } from "@pos/types";

/** Destino de impresión de comanda. */
export type KitchenTarget = "kitchen" | "bar";

/** Un ticket abierto en memoria (pestaña). */
export interface TicketSlot {
  id:             string;
  cart:           CartItem[];
  orderRef:       string;
  orderNotes:     string;
  /** id de la orden guardada en DB (null = aún no persistida). */
  currentOrderId: number | null;
  monthlyNum:     number | null;
}

/** Detalle de una orden/venta cargado desde el backend. */
export interface OrderDetail {
  id:              number;
  items:           CartItem[];
  notes:           string;
  reference:       string;
  total:           number;
  monthly_number?: number | null;
}
