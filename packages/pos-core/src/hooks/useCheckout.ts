import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@pos/api-client";
import { useToast } from "@pos/ui-kit";
import type { CartItem, SavedOrder } from "@pos/types";

export interface CheckoutPayload {
  cart:           CartItem[];
  cartTotal:      number;
  currentOrderId: number | null;
  orderRef:       string;
  orderNotes:     string;
}

export interface PayResult {
  id:         number | null;
  total:      number;
  tip_amount: number;
}

/** Cobro (POST /sales) y guardado de orden abierta (POST|PUT /orders). */
export function useCheckout() {
  const { show } = useToast();
  const [tipPercentage,   setTipPercentage]   = useState(0);
  const [payLoading,      setPayLoading]       = useState(false);
  const [payNoTipLoading, setPayNoTipLoading]  = useState(false);
  const [saveLoading,     setSaveLoading]      = useState(false);

  /* Idempotencia: un id por intento de cobro; se libera al confirmar. */
  const requestIdRef = useRef<string | null>(null);

  useEffect(() => {
    apiRequest("/settings/tip")
      .then((r: unknown) => {
        const pct = Number((r as Record<string, unknown>)?.value ?? 0);
        setTipPercentage(Number.isFinite(pct) ? pct : 0);
      })
      .catch(() => { /* sin propina por defecto */ });
  }, []);

  const payOrder = useCallback(
    async (p: CheckoutPayload & { noTip: boolean }): Promise<PayResult | null> => {
      if (p.cart.length === 0) return null;
      if (!requestIdRef.current) {
        requestIdRef.current =
          crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
      if (p.noTip) setPayNoTipLoading(true);
      else         setPayLoading(true);
      try {
        const body: Record<string, unknown> = {
          items: p.cart.map(i => ({ product_id: i.productId, quantity: i.quantity, notes: i.notes || null })),
          reference: p.orderRef || undefined,
          order_id: p.currentOrderId ?? undefined,
          notes: p.orderNotes || null,
          client_request_id: requestIdRef.current,
        };
        if (p.noTip) {
          body.tip_amount     = 0;
          body.tip_percentage = 0;
        }
        const result = (await apiRequest("/sales", {
          method: "POST",
          body: JSON.stringify(body),
        })) as { id?: number; total?: number; tip_amount?: number };

        requestIdRef.current = null;
        navigator.vibrate?.([20, 60, 20]);
        return {
          id:         result?.id ?? null,
          total:      Number(result?.total ?? p.cartTotal),
          tip_amount: Number(result?.tip_amount ?? 0),
        };
      } catch (err) {
        show(err instanceof Error ? err.message : "Error al cobrar", { type: "error" });
        return null;
      } finally {
        setPayLoading(false);
        setPayNoTipLoading(false);
      }
    },
    [show],
  );

  const saveOrder = useCallback(
    async (p: CheckoutPayload): Promise<SavedOrder | null> => {
      if (p.cart.length === 0) {
        show("El ticket está vacío", { type: "warning" });
        return null;
      }
      setSaveLoading(true);
      try {
        const items = p.cart.map(i => ({ product_id: i.productId, quantity: i.quantity, notes: i.notes || null }));
        const isUpdate = p.currentOrderId != null;
        const result = (await apiRequest(isUpdate ? `/orders/${p.currentOrderId}` : "/orders", {
          method: isUpdate ? "PUT" : "POST",
          body: JSON.stringify({ items, reference: p.orderRef || null, notes: p.orderNotes || null }),
        })) as SavedOrder;

        show(isUpdate ? "Orden actualizada" : "Orden guardada", { type: "success" });
        return result;
      } catch (err) {
        show(err instanceof Error ? err.message : "Error al guardar la orden", { type: "error" });
        return null;
      } finally {
        setSaveLoading(false);
      }
    },
    [show],
  );

  return { tipPercentage, payLoading, payNoTipLoading, saveLoading, payOrder, saveOrder };
}
