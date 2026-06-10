import { useState, useMemo, useCallback, useRef } from "react";
import { Button, useToast } from "@pos/ui-kit";
import { apiRequest } from "../../services/api";

/* ── Types ──────────────────────────────────────────────────── */

interface CartItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
}

interface Seat {
  id: number;
  label: string;
  /** Porción de cada item asignada (en modo ítems) */
  items: SeatItem[];
  paid: boolean;
}

interface SeatItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
}

type Mode = "equal" | "items";

interface Props {
  open: boolean;
  onClose: () => void;
  cart: CartItem[];
  cartTotal: number;
  /** Se llama cuando TODOS los comensales han pagado */
  onAllPaid: (lastSaleId: number | null) => void;
}

/* ── Helpers ────────────────────────────────────────────────── */

const fmt = (n: number) =>
  new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ", minimumFractionDigits: 2 }).format(n);

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const uuid = () => crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Divide `total` en `n` partes que suman EXACTAMENTE total (los primeros llevan 1 centavo extra). */
const splitEqual = (total: number, n: number): number[] => {
  if (n <= 0) return [];
  const cents = Math.round(total * 100);
  const base  = Math.floor(cents / n);
  const extra = cents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < extra ? 1 : 0)) / 100);
};

function makeSeat(id: number): Seat {
  return { id, label: `Comensal ${id}`, items: [], paid: false };
}

/* ── Icons ──────────────────────────────────────────────────── */
function CheckCircleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}
function MinusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}
function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
  );
}
function PrinterIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9"/>
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
      <rect x="6" y="14" width="12" height="8"/>
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════ */

export default function SplitBillSheet({
  open, onClose, cart, cartTotal, onAllPaid,
}: Props) {
  const { show } = useToast();

  const [mode, setMode]           = useState<Mode>("equal");
  const [numPeople, setNumPeople] = useState(2);
  const [seats, setSeats]         = useState<Seat[]>([makeSeat(1), makeSeat(2)]);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [allLoading, setAllLoading] = useState(false);
  const [printingId, setPrintingId] = useState<number | null>(null);
  const [includeTip, setIncludeTip] = useState(true);

  /* Idempotencia: un id por cobro, reusado entre reintentos (evita doble cobro). */
  const payAllIdRef  = useRef<string | null>(null);
  const seatIdsRef   = useRef<Record<number, string>>({});

  /* ── unassigned pool (items mode) ─────────────────────────── */

  const assignedMap = useMemo(() => {
    const map: Record<number, number> = {};
    for (const seat of seats) {
      for (const si of seat.items) {
        map[si.productId] = (map[si.productId] ?? 0) + si.quantity;
      }
    }
    return map;
  }, [seats]);

  const unassigned: SeatItem[] = useMemo(() =>
    cart.flatMap(item => {
      const used = assignedMap[item.productId] ?? 0;
      const remaining = item.quantity - used;
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

  /* ── seat helpers ─────────────────────────────────────────── */

  const setSeatCount = (n: number) => {
    const clamped = Math.max(2, Math.min(20, n));
    setNumPeople(clamped);
    setSeats(prev => {
      if (clamped > prev.length) {
        const extra = Array.from({ length: clamped - prev.length }, (_, i) =>
          makeSeat(prev.length + i + 1),
        );
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
      const updated = s.items.map(i =>
        i.productId === productId ? { ...i, quantity: i.quantity - qty } : i,
      ).filter(i => i.quantity > 0);
      return { ...s, items: updated };
    }));
  };

  const distributeEquallyToSeat = (seatId: number) => {
    if (unassigned.length === 0) return;
    unassigned.forEach(item => assignItemToSeat(seatId, item, item.quantity));
  };

  /* ── reset when reopened ──────────────────────────────────── */

  const resetState = useCallback(() => {
    setMode("equal");
    setNumPeople(2);
    setSeats([makeSeat(1), makeSeat(2)]);
    setLoadingId(null);
    setAllLoading(false);
    setPrintingId(null);
    setIncludeTip(true);
    payAllIdRef.current = null;
    seatIdsRef.current = {};
  }, []);

  /* ── pay logic ─────────────────────────────────────────────── */

  const buildSaleBody = (items: SeatItem[], requestId: string, seatLabel?: string) => ({
    // El precio NO se envía: el backend lo toma de la DB (evita manipulación).
    items: items.map(i => ({ product_id: i.productId, quantity: i.quantity })),
    ...(includeTip ? {} : { tip_amount: 0, tip_percentage: 0 }),
    reference: ["SUB CUENTA", seatLabel ?? undefined].filter(Boolean).join(" · ") || undefined,
    client_request_id: requestId,
  });

  /** Imprime el recibo de una venta ya cobrada */
  const printReceipt = async (seatId: number, saleId: number, label: string) => {
    setPrintingId(seatId);
    try {
      await apiRequest("/print/receipt", {
        method: "POST",
        body: JSON.stringify({ sale_id: saleId }),
        timeoutMs: 10_000,
      });
      show(`Recibo de ${label} enviado a la impresora`, { type: "success" });
    } catch {
      show("Impresora no disponible — revisa configuración", { type: "error" });
    } finally {
      setPrintingId(null);
    }
  };

  /** Paga un comensal individual (modo ítems) y lo imprime */
  const paySeat = async (seat: Seat) => {
    if (seat.items.length === 0) { show("Este comensal no tiene ítems asignados", { type: "warning" }); return; }
    if (!seatIdsRef.current[seat.id]) seatIdsRef.current[seat.id] = uuid();
    setLoadingId(seat.id);
    try {
      const seatTotal = money(seat.items.reduce((s, i) => s + money(i.price * i.quantity), 0));
      const body = buildSaleBody(seat.items, seatIdsRef.current[seat.id], seat.label);
      const result = await apiRequest("/sales", {
        method: "POST",
        body: JSON.stringify(body), // cada split = venta independiente
      }) as { id?: number };

      setSeats(prev => prev.map(s =>
        s.id === seat.id ? { ...s, paid: true } : s,
      ));
      show(`${seat.label} cobrado — ${fmt(seatTotal)}`, { type: "success" });

      if (result.id) {
        await printReceipt(seat.id, result.id, seat.label);
      }

      // Si todos pagaron, cerrar
      setSeats(prev => {
        const updated = prev.map(s => s.id === seat.id ? { ...s, paid: true } : s);
        const allPaid = updated.every(s => s.paid);
        if (allPaid) {
          setTimeout(() => { onAllPaid(result.id ?? null); resetState(); }, 500);
        }
        return updated;
      });
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "Error al cobrar", { type: "error" });
    } finally {
      setLoadingId(null);
    }
  };

  /** Paga todos juntos (modo igual) y lo imprime */
  const payAll = async () => {
    if (!payAllIdRef.current) payAllIdRef.current = uuid();
    setAllLoading(true);
    try {
      const splitLabel = `Dividida entre ${numPeople}`;
      const body = buildSaleBody(
        cart.map(i => ({ productId: i.productId, name: i.name, price: i.price, quantity: i.quantity })),
        payAllIdRef.current,
        splitLabel,
      );
      const result = await apiRequest("/sales", {
        method: "POST",
        body: JSON.stringify(body),
      }) as { id?: number };

      show(`Cuenta dividida cobrada — ${fmt(cartTotal)}`, { type: "success" });

      if (result.id) {
        await printReceipt(-1, result.id, splitLabel);
      }

      onAllPaid(result.id ?? null);
      resetState();
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "Error al cobrar", { type: "error" });
    } finally {
      setAllLoading(false);
    }
  };

  /* ── per-seat amounts (equal mode) — suman EXACTAMENTE cartTotal ──────────── */
  const shares     = useMemo(() => splitEqual(cartTotal, numPeople), [cartTotal, numPeople]);
  const minShare   = shares.length ? shares[shares.length - 1] : 0;
  const maxShare   = shares.length ? shares[0] : 0;
  const sharesEven = minShare === maxShare;
  const perPersonLabel = sharesEven ? fmt(maxShare) : `${fmt(minShare)} – ${fmt(maxShare)}`;
  const allPaid = seats.every(s => s.paid);

  if (!open) return null;

  /* ══════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════ */
  return (
    <div className="sbs-overlay" onClick={e => { if (e.target === e.currentTarget) { resetState(); onClose(); } }}>
      <div className="sbs-panel">

        {/* ── Header ─────────────────────────────────────── */}
        <div className="sbs-header">
          <div>
            <div className="sbs-header-title">Dividir cuenta</div>
            <div className="sbs-header-sub">{fmt(cartTotal)} · {cart.length} ítems</div>
          </div>
          <div className="sbs-header-actions">
            <label className="sbs-tip-toggle" title={includeTip ? "Propina incluida" : "Sin propina"}>
              <span className="sbs-tip-toggle-label">Propina</span>
              <div className={`sbs-switch${includeTip ? " sbs-switch--on" : ""}`} onClick={() => setIncludeTip(v => !v)}>
                <div className="sbs-switch-thumb" />
              </div>
            </label>
            <button className="sbs-close-btn" onClick={() => { resetState(); onClose(); }}>✕</button>
          </div>
        </div>

        {/* ── Mode tabs ──────────────────────────────────── */}
        <div className="sbs-tabs">
          <button
            className={`sbs-tab${mode === "equal" ? " sbs-tab--active" : ""}`}
            onClick={() => setMode("equal")}
          >
            División igual
          </button>
          <button
            className={`sbs-tab${mode === "items" ? " sbs-tab--active" : ""}`}
            onClick={() => setMode("items")}
          >
            Por ítems
          </button>
        </div>

        {/* ── CONTENT ────────────────────────────────────── */}
        <div className="sbs-body">

          {/* ══════════════════════════════════════════════
              MODO: DIVISIÓN IGUAL
          ══════════════════════════════════════════════ */}
          {mode === "equal" && (
            <div className="sbs-equal">
              {/* People counter */}
              <div className="sbs-people-row">
                <span className="sbs-people-label">Número de comensales</span>
                <div className="sbs-counter">
                  <button
                    className="sbs-counter-btn"
                    onClick={removeSeat}
                    disabled={numPeople <= 2}
                  >
                    <MinusIcon />
                  </button>
                  <span className="sbs-counter-value">{numPeople}</span>
                  <button
                    className="sbs-counter-btn"
                    onClick={addSeat}
                    disabled={numPeople >= 20}
                  >
                    <PlusIcon />
                  </button>
                </div>
              </div>

              {/* Seat cards */}
              <div className="sbs-equal-grid">
                {seats.map((seat, idx) => (
                  <div
                    key={seat.id}
                    className={`sbs-equal-card${seat.paid ? " sbs-equal-card--paid" : ""}`}
                  >
                    <div className="sbs-seat-icon"><UserIcon /></div>
                    <div className="sbs-seat-label">{seat.label}</div>
                    <div className="sbs-seat-amount">{fmt(shares[idx] ?? 0)}</div>
                    {seat.paid ? (
                      <div className="sbs-paid-badge"><CheckCircleIcon /> Cobrado</div>
                    ) : (
                      <div className="sbs-seat-share">
                        {idx === 0 ? "Primer comensal" : `${((1 / numPeople) * 100).toFixed(0)}% del total`}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Summary row */}
              <div className="sbs-summary-row">
                <div className="sbs-summary-item">
                  <span className="sbs-summary-label">Cada uno paga</span>
                  <span className="sbs-summary-value">{perPersonLabel}</span>
                </div>
                <div className="sbs-summary-item">
                  <span className="sbs-summary-label">Total</span>
                  <span className="sbs-summary-value sbs-summary-value--total">{fmt(cartTotal)}</span>
                </div>
              </div>

              <Button
                variant="primary"
                size="xl"
                fullWidth
                loading={allLoading}
                onClick={() => void payAll()}
              >
                <PrinterIcon /> Cobrar e imprimir — {fmt(cartTotal)}
              </Button>
            </div>
          )}

          {/* ══════════════════════════════════════════════
              MODO: POR ÍTEMS
          ══════════════════════════════════════════════ */}
          {mode === "items" && (
            <div className="sbs-items">
              {/* Unassigned pool */}
              {unassigned.length > 0 && (
                <div className="sbs-pool">
                  <div className="sbs-pool-header">
                    <span className="sbs-pool-title">Ítems sin asignar</span>
                    <span className="sbs-pool-total">{fmt(totalUnassigned)}</span>
                  </div>
                  <div className="sbs-pool-items">
                    {unassigned.map(item => (
                      <div key={item.productId} className="sbs-pool-item">
                        <div className="sbs-pool-item-info">
                          <span className="sbs-pool-item-name">{item.name}</span>
                          <span className="sbs-pool-item-price">{fmt(item.price)} × {item.quantity}</span>
                        </div>
                        {/* Assign buttons per seat */}
                        <div className="sbs-assign-btns">
                          {seats.filter(s => !s.paid).map(seat => (
                            <button
                              key={seat.id}
                              className="sbs-assign-btn"
                              title={`Asignar a ${seat.label}`}
                              onClick={() => assignItemToSeat(seat.id, item, 1)}
                            >
                              C{seat.id} <ArrowRightIcon />
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Seat panels */}
              <div className="sbs-seats-list">
                {seats.map(seat => {
                  const seatTotal = seat.items.reduce((s, i) => s + i.price * i.quantity, 0);
                  return (
                    <div
                      key={seat.id}
                      className={`sbs-seat-panel${seat.paid ? " sbs-seat-panel--paid" : ""}`}
                    >
                      <div className="sbs-seat-panel-header">
                        <div className="sbs-seat-panel-name">
                          <div className="sbs-seat-avatar">{seat.id}</div>
                          <span>{seat.label}</span>
                        </div>
                        {!seat.paid && unassigned.length > 0 && (
                          <button
                            className="sbs-quick-assign"
                            onClick={() => distributeEquallyToSeat(seat.id)}
                            title="Asignar todos los ítems sin asignar"
                          >
                            + Asignar todo
                          </button>
                        )}
                      </div>

                      {seat.items.length === 0 ? (
                        <div className="sbs-seat-empty">Sin ítems asignados</div>
                      ) : (
                        <div className="sbs-seat-items">
                          {seat.items.map(item => (
                            <div key={item.productId} className="sbs-seat-item">
                              <span className="sbs-seat-item-name">{item.name}</span>
                              <span className="sbs-seat-item-qty">× {item.quantity}</span>
                              <span className="sbs-seat-item-sub">{fmt(item.price * item.quantity)}</span>
                              {!seat.paid && (
                                <button
                                  className="sbs-remove-item"
                                  onClick={() => removeItemFromSeat(seat.id, item.productId, 1)}
                                  title="Quitar ítem"
                                >
                                  ←
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="sbs-seat-footer">
                        <span className="sbs-seat-subtotal">{fmt(seatTotal)}</span>
                        {seat.paid ? (
                          <div className="sbs-paid-chip"><CheckCircleIcon /> Cobrado</div>
                        ) : (
                          <button
                            className="sbs-cobrar-btn"
                            disabled={seat.items.length === 0 || loadingId !== null}
                            onClick={() => void paySeat(seat)}
                          >
                            {loadingId === seat.id
                              ? "Cobrando..."
                              : printingId === seat.id
                                ? "Imprimiendo..."
                                : <><PrinterIcon /> Cobrar e imprimir</>}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add seat button */}
              {!allPaid && (
                <button className="sbs-add-seat-btn" onClick={addSeat}>
                  <PlusIcon /> Agregar comensal
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
