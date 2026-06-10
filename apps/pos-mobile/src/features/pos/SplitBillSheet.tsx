import { useCallback, useMemo, useState } from "react";
import { Button, Spinner, useToast } from "@pos/ui-kit";
import { apiRequest } from "@pos/api-client";
import { fmt } from "@pos/pos-core";
import type { CartItem } from "@pos/types";
import "./split-bill-sheet.css";

interface SeatItem {
  productId: number;
  name:      string;
  price:     number;
  quantity:  number;
}

interface Seat {
  id:     number;
  label:  string;
  items:  SeatItem[];
  paid:   boolean;
  saleId?: number;
}

type Mode = "equal" | "items";

interface Props {
  open:           boolean;
  onClose:        () => void;
  cart:           CartItem[];
  cartTotal:      number;
  orderRef:       string;
  currentOrderId: number | null;
  tipPercentage:  number;
  /** Se llama cuando TODOS los comensales han pagado. */
  onAllPaid:      (lastSaleId: number | null) => void;
}

function makeSeat(id: number): Seat {
  return { id, label: `Comensal ${id}`, items: [], paid: false };
}

/* ── Icons ───────────────────────────────────────────────── */
function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function MinusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function PrinterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════ */

export default function SplitBillSheet({
  open, onClose, cart, cartTotal, orderRef, currentOrderId, tipPercentage, onAllPaid,
}: Props) {
  const { show } = useToast();

  const [mode, setMode]             = useState<Mode>("equal");
  const [numPeople, setNumPeople]   = useState(2);
  const [seats, setSeats]           = useState<Seat[]>([makeSeat(1), makeSeat(2)]);
  const [includeTip, setIncludeTip] = useState(true);
  const [loadingId, setLoadingId]   = useState<number | null>(null);
  const [allLoading, setAllLoading] = useState(false);

  const tipActive = includeTip && tipPercentage > 0;
  const withTip = (base: number) => (tipActive ? base * (1 + tipPercentage / 100) : base);

  /* ── pool sin asignar (modo ítems) ──────────────────────── */
  const assignedMap = useMemo(() => {
    const map: Record<number, number> = {};
    for (const seat of seats) {
      for (const si of seat.items) map[si.productId] = (map[si.productId] ?? 0) + si.quantity;
    }
    return map;
  }, [seats]);

  const unassigned: SeatItem[] = useMemo(() =>
    cart.flatMap(item => {
      const remaining = item.quantity - (assignedMap[item.productId] ?? 0);
      return remaining > 0
        ? [{ productId: item.productId, name: item.name, price: item.price, quantity: remaining }]
        : [];
    }),
    [cart, assignedMap],
  );

  const totalUnassigned = useMemo(
    () => unassigned.reduce((s, i) => s + i.price * i.quantity, 0),
    [unassigned],
  );

  /* Cantidad total de unidades en el carrito (para detectar ítems sin cobrar). */
  const cartQty = useMemo(
    () => cart.reduce((s, i) => s + i.quantity, 0),
    [cart],
  );

  /* ── helpers comensales ─────────────────────────────────── */
  const setSeatCount = (n: number) => {
    const clamped = Math.max(2, Math.min(20, n));
    setNumPeople(clamped);
    setSeats(prev => {
      if (clamped > prev.length) {
        const extra = Array.from({ length: clamped - prev.length }, (_, i) => makeSeat(prev.length + i + 1));
        return [...prev, ...extra];
      }
      return prev.slice(0, clamped);
    });
  };
  const addSeat = () => setSeatCount(seats.length + 1);
  const removeSeat = () => setSeatCount(seats.length - 1);

  const assignItemToSeat = (seatId: number, item: SeatItem, qty = 1) => {
    setSeats(prev => prev.map(s => {
      if (s.id !== seatId) return s;
      const existing = s.items.find(i => i.productId === item.productId);
      if (existing) {
        return { ...s, items: s.items.map(i => i.productId === item.productId ? { ...i, quantity: i.quantity + qty } : i) };
      }
      return { ...s, items: [...s.items, { ...item, quantity: qty }] };
    }));
  };

  const removeItemFromSeat = (seatId: number, productId: number, qty = 1) => {
    setSeats(prev => prev.map(s => {
      if (s.id !== seatId) return s;
      const updated = s.items
        .map(i => i.productId === productId ? { ...i, quantity: i.quantity - qty } : i)
        .filter(i => i.quantity > 0);
      return { ...s, items: updated };
    }));
  };

  const distributeAllToSeat = (seatId: number) => {
    if (unassigned.length === 0) return;
    unassigned.forEach(item => assignItemToSeat(seatId, item, item.quantity));
  };

  const resetState = useCallback(() => {
    setMode("equal");
    setNumPeople(2);
    setSeats([makeSeat(1), makeSeat(2)]);
    setIncludeTip(true);
    setLoadingId(null);
    setAllLoading(false);
  }, []);

  const closeAndReset = () => { resetState(); onClose(); };

  /* ── construcción de la venta ───────────────────────────── */
  const buildSaleBody = (items: SeatItem[], seatLabel?: string) => ({
    items: items.map(i => ({ product_id: i.productId, quantity: i.quantity, price: i.price })),
    ...(includeTip ? {} : { tip_amount: 0, tip_percentage: 0 }),
    reference: ["SUB CUENTA", seatLabel, orderRef || undefined].filter(Boolean).join(" · ") || undefined,
  });

  /* Cierre del split por ítems: las sub-cuentas son ventas independientes,
     así que la orden abierta original (si existía) quedaría colgada → la
     cancelamos para no dejar una orden 'open' fantasma en la base. */
  const finalizeItemsSplit = async (lastSaleId: number | null) => {
    if (currentOrderId != null) {
      try {
        await apiRequest(`/sales/${currentOrderId}/cancel`, { method: "POST" });
      } catch {
        /* la orden quizá ya no estaba abierta; no es bloqueante */
      }
    }
    onAllPaid(lastSaleId);
    resetState();
  };

  const printReceipt = async (saleId: number, label: string) => {
    try {
      await apiRequest("/print/receipt", {
        method: "POST",
        body: JSON.stringify({ sale_id: saleId }),
        timeoutMs: 10_000,
      });
      show(`Recibo de ${label} enviado a la impresora`, { type: "success" });
    } catch {
      show("Impresora no disponible — revisa configuración", { type: "error" });
    }
  };

  /** Cobra un comensal individual (modo ítems). */
  const paySeat = async (seat: Seat) => {
    if (seat.items.length === 0) { show("Este comensal no tiene ítems asignados", { type: "warning" }); return; }
    setLoadingId(seat.id);
    try {
      const seatBase = seat.items.reduce((s, i) => s + i.price * i.quantity, 0);
      const result = await apiRequest("/sales", {
        method: "POST",
        body: JSON.stringify(buildSaleBody(seat.items, seat.label)), // cada split = venta independiente
      }) as { id?: number };

      show(`${seat.label} cobrado — ${fmt(withTip(seatBase))}`, { type: "success" });
      if (result.id) await printReceipt(result.id, seat.label);

      setSeats(prev => {
        const updated = prev.map(s => s.id === seat.id ? { ...s, paid: true, saleId: result.id } : s);
        const allPaid = updated.every(s => s.paid);
        const assignedQty = updated.reduce((sum, s) => sum + s.items.reduce((a, i) => a + i.quantity, 0), 0);
        if (allPaid && assignedQty >= cartQty) {
          setTimeout(() => { void finalizeItemsSplit(result.id ?? null); }, 400);
        } else if (allPaid) {
          show("Quedan ítems sin asignar. Agregá un comensal para cobrarlos.", { type: "warning" });
        }
        return updated;
      });
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "Error al cobrar", { type: "error" });
    } finally {
      setLoadingId(null);
    }
  };

  /** Cobra todo junto (modo igual). */
  const payAll = async () => {
    setAllLoading(true);
    try {
      const label = `Dividida entre ${numPeople}`;
      const items: SeatItem[] = cart.map(i => ({ productId: i.productId, name: i.name, price: i.price, quantity: i.quantity }));
      const result = await apiRequest("/sales", {
        method: "POST",
        body: JSON.stringify({ ...buildSaleBody(items, label), order_id: currentOrderId ?? undefined }),
      }) as { id?: number };

      show(`Cuenta dividida cobrada — ${fmt(withTip(cartTotal))}`, { type: "success" });
      if (result.id) await printReceipt(result.id, label);

      onAllPaid(result.id ?? null);
      resetState();
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "Error al cobrar", { type: "error" });
    } finally {
      setAllLoading(false);
    }
  };

  const perPersonAmount = withTip(cartTotal) / numPeople;
  const allPaid = seats.every(s => s.paid);

  if (!open) return null;

  return (
    <div className="sb-overlay">
      {/* ── Header ── */}
      <div className="sb-header">
        <div className="sb-header-info">
          <span className="sb-header-title">Dividir cuenta</span>
          <span className="sb-header-sub tabular">{fmt(cartTotal)} · {cart.length} ítems</span>
        </div>
        <button className="sb-close" onClick={closeAndReset} aria-label="Cerrar">✕</button>
      </div>

      {/* ── Toggle propina ── */}
      <button
        className={`sb-tip-toggle${tipActive ? " sb-tip-toggle--on" : ""}`}
        onClick={() => setIncludeTip(v => !v)}
        disabled={tipPercentage === 0}
        type="button"
      >
        <span className="sb-tip-label">
          {tipPercentage === 0
            ? "Sin propina configurada"
            : `Propina ${tipPercentage}%`}
        </span>
        <span className={`sb-switch${tipActive ? " sb-switch--on" : ""}`}>
          <span className="sb-switch-thumb" />
        </span>
      </button>

      {/* ── Tabs ── */}
      <div className="sb-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={mode === "equal"}
          className={`sb-tab${mode === "equal" ? " sb-tab--active" : ""}`}
          onClick={() => setMode("equal")}
        >
          División igual
        </button>
        <button
          role="tab"
          aria-selected={mode === "items"}
          className={`sb-tab${mode === "items" ? " sb-tab--active" : ""}`}
          onClick={() => setMode("items")}
        >
          Por ítems
        </button>
      </div>

      {/* ── Body ── */}
      <div className="sb-body">
        {/* ════ MODO IGUAL ════ */}
        {mode === "equal" && (
          <div className="sb-equal">
            <div className="sb-people-row">
              <span className="sb-people-label">Comensales</span>
              <div className="sb-counter">
                <button className="sb-counter-btn" onClick={removeSeat} disabled={numPeople <= 2}><MinusIcon /></button>
                <span className="sb-counter-val">{numPeople}</span>
                <button className="sb-counter-btn" onClick={addSeat} disabled={numPeople >= 20}><PlusIcon /></button>
              </div>
            </div>

            <div className="sb-perperson">
              <span className="sb-perperson-label">Cada uno paga</span>
              <span className="sb-perperson-amount tabular">{fmt(perPersonAmount)}</span>
            </div>

            <div className="sb-totals">
              <div className="sb-total-row">
                <span>Subtotal</span>
                <span className="tabular">{fmt(cartTotal)}</span>
              </div>
              {tipActive && (
                <div className="sb-total-row">
                  <span>Propina ({tipPercentage}%)</span>
                  <span className="tabular">{fmt(withTip(cartTotal) - cartTotal)}</span>
                </div>
              )}
              <div className="sb-total-row sb-total-row--main">
                <span>Total</span>
                <span className="tabular">{fmt(withTip(cartTotal))}</span>
              </div>
            </div>

            <Button variant="primary" size="xl" fullWidth loading={allLoading} onClick={() => void payAll()}>
              <span className="sb-btn-inner"><PrinterIcon /> Cobrar e imprimir — {fmt(withTip(cartTotal))}</span>
            </Button>
          </div>
        )}

        {/* ════ MODO POR ÍTEMS ════ */}
        {mode === "items" && (
          <div className="sb-items">
            {unassigned.length > 0 && (
              <div className="sb-pool">
                <div className="sb-pool-head">
                  <span className="sb-pool-title">Sin asignar</span>
                  <span className="sb-pool-total tabular">{fmt(totalUnassigned)}</span>
                </div>
                <div className="sb-pool-list">
                  {unassigned.map(item => (
                    <div key={item.productId} className="sb-pool-item">
                      <div className="sb-pool-item-info">
                        <span className="sb-pool-item-name">{item.name}</span>
                        <span className="sb-pool-item-price tabular">{fmt(item.price)} × {item.quantity}</span>
                      </div>
                      <div className="sb-assign-btns">
                        {seats.filter(s => !s.paid).map(seat => (
                          <button
                            key={seat.id}
                            className="sb-assign-btn"
                            onClick={() => assignItemToSeat(seat.id, item, 1)}
                            title={`Asignar a ${seat.label}`}
                          >
                            C{seat.id}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="sb-seats">
              {seats.map(seat => {
                const seatBase = seat.items.reduce((s, i) => s + i.price * i.quantity, 0);
                return (
                  <div key={seat.id} className={`sb-seat${seat.paid ? " sb-seat--paid" : ""}`}>
                    <div className="sb-seat-head">
                      <div className="sb-seat-name">
                        <span className="sb-seat-avatar">{seat.id}</span>
                        <span>{seat.label}</span>
                      </div>
                      {!seat.paid && unassigned.length > 0 && (
                        <button className="sb-seat-all" onClick={() => distributeAllToSeat(seat.id)}>
                          + Todo
                        </button>
                      )}
                    </div>

                    {seat.items.length === 0 ? (
                      <div className="sb-seat-empty">Sin ítems asignados</div>
                    ) : (
                      <div className="sb-seat-items">
                        {seat.items.map(item => (
                          <div key={item.productId} className="sb-seat-item">
                            <span className="sb-seat-item-name">{item.name}</span>
                            <span className="sb-seat-item-qty tabular">× {item.quantity}</span>
                            <span className="sb-seat-item-sub tabular">{fmt(item.price * item.quantity)}</span>
                            {!seat.paid && (
                              <button
                                className="sb-seat-item-rm"
                                onClick={() => removeItemFromSeat(seat.id, item.productId, 1)}
                                aria-label="Quitar ítem"
                              >
                                ←
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="sb-seat-foot">
                      <div className="sb-seat-foot-total">
                        <span className="tabular">{fmt(withTip(seatBase))}</span>
                        {tipActive && seatBase > 0 && (
                          <span className="sb-seat-foot-tip">incl. propina</span>
                        )}
                      </div>
                      {seat.paid ? (
                        <span className="sb-seat-paid"><CheckIcon /> Cobrado</span>
                      ) : (
                        <button
                          className="sb-seat-pay"
                          disabled={seat.items.length === 0 || loadingId !== null}
                          onClick={() => void paySeat(seat)}
                        >
                          {loadingId === seat.id
                            ? <Spinner size="sm" />
                            : <><PrinterIcon /> Cobrar</>}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {allPaid && unassigned.length > 0 && (
              <p className="sb-warn">
                Quedan ítems sin asignar ({fmt(totalUnassigned)}). Agregá un comensal para cobrarlos.
              </p>
            )}

            {(!allPaid || unassigned.length > 0) && (
              <button className="sb-add-seat" onClick={addSeat}>
                <PlusIcon /> Agregar comensal
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
