import { useCallback, useState } from "react";
import { apiRequest } from "@pos/api-client";
import { useToast } from "@pos/ui-kit";
import type { KitchenTarget } from "../types";

/** Impresión de recibo (venta cobrada) y comanda de cocina/barra. */
export function usePrinting() {
  const { show } = useToast();
  const [printLoading, setPrintLoading] = useState(false);

  const printReceipt = useCallback(async (saleId: number) => {
    setPrintLoading(true);
    try {
      await apiRequest("/print/receipt", {
        method: "POST",
        body: JSON.stringify({ sale_id: saleId }),
        timeoutMs: 10_000,
      });
      show("Ticket enviado a la impresora", { type: "success" });
    } catch {
      show("Impresora no disponible — revisa configuración", { type: "error" });
    } finally {
      setPrintLoading(false);
    }
  }, [show]);

  const sendKitchenTicket = useCallback(async (orderId: number, targets: KitchenTarget[]) => {
    setPrintLoading(true);
    try {
      const res = (await apiRequest("/print/kitchen-ticket", {
        method: "POST",
        body: JSON.stringify({ saleId: orderId, targets }),
        timeoutMs: 5_000,
      })) as { success?: boolean; message?: string };

      if (res?.success) {
        const label = targets.length === 2 ? "Comanda enviada a cocina y barra"
          : targets[0] === "kitchen"       ? "Comanda enviada a cocina"
          :                                  "Comanda enviada a barra";
        show(label, { type: "success" });
      } else {
        throw new Error(res?.message || "Error desconocido");
      }
    } catch (err) {
      show(err instanceof Error ? err.message : "No se pudo enviar la comanda", { type: "error" });
    } finally {
      setPrintLoading(false);
    }
  }, [show]);

  return { printLoading, printReceipt, sendKitchenTicket };
}
