import { useCallback, useState } from "react";
import { apiRequest } from "@pos/api-client";
import { useToast } from "@pos/ui-kit";
import type { SavedOrder, PaidSale, CartItem } from "@pos/types";
import type { OrderDetail } from "../types";
import { toNum } from "../utils";

interface RawOrderItem {
  product_id?:   number;
  id?:           number;
  name?:         string;
  product_name?: string;
  price?:        number | string;
  quantity?:     number;
  notes?:        string;
}

/** Listas de órdenes abiertas y cobradas, con carga de detalle y cancelación. */
export function useOrders() {
  const { show } = useToast();
  const [orders,      setOrders]      = useState<SavedOrder[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [paidOrders,  setPaidOrders]  = useState<PaidSale[]>([]);
  const [loadingPaid, setLoadingPaid] = useState(false);
  const [canceling,   setCanceling]   = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await apiRequest("/orders")) as SavedOrder[];
      setOrders(Array.isArray(data) ? data : []);
    } catch {
      /* no crítico */
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshPaid = useCallback(async () => {
    setLoadingPaid(true);
    try {
      const res = (await apiRequest("/sales/paid")) as { data?: PaidSale[] };
      setPaidOrders(res?.data ?? []);
    } catch {
      /* no crítico */
    } finally {
      setLoadingPaid(false);
    }
  }, []);

  const loadOrderDetail = useCallback(async (orderId: number): Promise<OrderDetail | null> => {
    try {
      const sale = (await apiRequest(`/orders/${orderId}`)) as {
        items?: RawOrderItem[];
        notes?: string;
        reference?: string;
        total?: number | string;
        monthly_number?: number;
      };
      const items: CartItem[] = (sale.items ?? []).map(it => ({
        productId: Number(it.product_id ?? it.id ?? 0),
        name:      it.name ?? it.product_name ?? "",
        price:     toNum(it.price),
        quantity:  Number(it.quantity ?? 0),
        notes:     it.notes || undefined,
      }));
      return {
        id:              orderId,
        items,
        notes:           sale.notes ?? "",
        reference:       sale.reference ?? "",
        total:           toNum(sale.total),
        monthly_number:  sale.monthly_number ?? null,
      };
    } catch {
      return null;
    }
  }, []);

  const cancelOrder = useCallback(async (orderId: number): Promise<boolean> => {
    setCanceling(true);
    try {
      await apiRequest(`/sales/${orderId}/cancel`, { method: "POST" });
      setOrders(prev => prev.filter(o => o.id !== orderId));
      show("Orden eliminada", { type: "success" });
      return true;
    } catch (err) {
      show(err instanceof Error ? err.message : "No se pudo eliminar la orden", { type: "error" });
      return false;
    } finally {
      setCanceling(false);
    }
  }, [show]);

  return { orders, loading, paidOrders, loadingPaid, canceling, refresh, refreshPaid, loadOrderDetail, cancelOrder };
}
