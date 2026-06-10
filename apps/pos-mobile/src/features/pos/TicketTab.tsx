import { useEffect, useState } from "react";
import type { CartItem, SavedOrder, PaidSale } from "@pos/types";
import type { TicketSlot, KitchenTarget, OrderDetail } from "@pos/pos-core";
import { fmt, toNum } from "@pos/pos-core";
import { BottomSheet, Button, Spinner } from "@pos/ui-kit";
import "./ticket-tab.css";

interface TicketTabProps {
  cart:            CartItem[];
  cartTotal:       number;
  currentOrderId:  number | null;
  orderRef:        string;
  setOrderRef:     (v: string) => void;
  orderNotes:      string;
  setOrderNotes:   (v: string) => void;
  setItemNotes:    (productId: number, notes: string) => void;
  increaseQty:     (productId: number) => void;
  decreaseQty:     (productId: number) => void;
  removeItem:      (productId: number) => void;
  tipPercentage:   number;
  payLoading:      boolean;
  payNoTipLoading: boolean;
  saveLoading:     boolean;
  orders:          SavedOrder[];
  ordersLoading:   boolean;
  paidOrders:      PaidSale[];
  paidLoading:     boolean;
  onPay:           (noTip: boolean) => Promise<void>;
  onSave:          () => Promise<void>;
  onSplit:         () => void;
  onLoadOrder:     (order: SavedOrder) => Promise<void>;
  onDeleteOrder:   (orderId: number) => Promise<boolean>;
  deleting:        boolean;
  onRefreshOrders: () => Promise<void>;
  onRefreshPaid:   () => Promise<void>;
  onLoadDetail:    (orderId: number) => Promise<OrderDetail | null>;
  onReprintReceipt: (saleId: number) => Promise<void>;
  /* Impresión de cocina/barra */
  printerMode:     "single" | "dual";
  printLoading:    boolean;
  onPrintKitchen:  (targets: KitchenTarget[]) => void;
  /* Multi-ticket */
  slots:           TicketSlot[];
  activeIndex:     number;
  onCreateTicket:  () => void;
  onSwitchTicket:  (index: number) => void;
  onCloseTicket:   (index: number) => void;
}

function PrinterIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-GT", {
    day:    "numeric",
    month:  "short",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

function slotLabel(slot: TicketSlot, index: number): string {
  if (slot.orderRef.trim()) return slot.orderRef.trim();
  return `Ticket ${index + 1}`;
}

function slotItemCount(slot: TicketSlot): number {
  return slot.cart.reduce((s, i) => s + i.quantity, 0);
}

/* ── Tab bar ─────────────────────────────────────────────── */
function TicketTabBar({
  slots,
  activeIndex,
  onSwitch,
  onCreate,
  onClose,
}: {
  slots: TicketSlot[];
  activeIndex: number;
  onSwitch: (i: number) => void;
  onCreate: () => void;
  onClose: (i: number) => void;
}) {
  return (
    <div className="tt-tabbar" role="tablist">
      {slots.map((slot, i) => {
        const count = slotItemCount(slot);
        const isActive = i === activeIndex;
        return (
          <button
            key={slot.id}
            role="tab"
            aria-selected={isActive}
            className={`tt-tab${isActive ? " tt-tab--active" : ""}`}
            onClick={() => onSwitch(i)}
          >
            <span className="tt-tab-label">{slotLabel(slot, i)}</span>
            {count > 0 && (
              <span className="tt-tab-count">{count > 99 ? "99+" : count}</span>
            )}
            <span
              className="tt-tab-close"
              role="button"
              aria-label={`Cerrar ${slotLabel(slot, i)}`}
              onClick={(e) => { e.stopPropagation(); onClose(i); }}
            >
              ×
            </span>
          </button>
        );
      })}
      <button
        className="tt-tab-new"
        onClick={onCreate}
        aria-label="Nuevo ticket"
        title="Nuevo ticket"
      >
        +
      </button>
    </div>
  );
}

/* ── TicketTab ───────────────────────────────────────────── */
export default function TicketTab({
  cart,
  cartTotal,
  currentOrderId,
  orderRef,
  setOrderRef,
  orderNotes,
  setOrderNotes,
  setItemNotes,
  increaseQty,
  decreaseQty,
  removeItem,
  tipPercentage,
  payLoading,
  payNoTipLoading,
  saveLoading,
  orders,
  ordersLoading,
  paidOrders,
  paidLoading,
  onPay,
  onSave,
  onSplit,
  onLoadOrder,
  onDeleteOrder,
  deleting,
  onRefreshOrders,
  onRefreshPaid,
  onLoadDetail,
  onReprintReceipt,
  printerMode,
  printLoading,
  onPrintKitchen,
  slots,
  activeIndex,
  onCreateTicket,
  onSwitchTicket,
  onCloseTicket,
}: TicketTabProps) {
  const [paySheetOpen, setPaySheetOpen] = useState(false);

  /* Ítem cuya nota se está editando inline (null = ninguno). */
  const [editingNotesId, setEditingNotesId] = useState<number | null>(null);

  /* Detalle de una venta cobrada (solo lectura). */
  const [detailSale,  setDetailSale]  = useState<PaidSale | null>(null);
  const [detailItems, setDetailItems] = useState<CartItem[] | null>(null);

  /* Confirmación de borrado de orden guardada (id en confirmación). */
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  /* Venta cuyo recibo se está reimprimiendo. */
  const [printingId, setPrintingId] = useState<number | null>(null);

  /* Cierra el sheet de cobro cuando el carrito queda vacío. */
  useEffect(() => {
    if (cart.length === 0) setPaySheetOpen(false);
  }, [cart.length]);

  /* Al quedar el ticket vacío, refresca ambas listas (guardadas + cobradas). */
  useEffect(() => {
    if (cart.length === 0) {
      void onRefreshOrders();
      void onRefreshPaid();
    }
  }, [cart.length, onRefreshOrders, onRefreshPaid]);

  const tipAmount    = cartTotal * (tipPercentage / 100);
  const totalWithTip = cartTotal + tipAmount;
  const displayTotal = tipPercentage > 0 ? totalWithTip : cartTotal;

  async function handlePayButton(noTip: boolean) {
    await onPay(noTip);
    setPaySheetOpen(false);
  }

  async function handleSelectOrder(order: SavedOrder) {
    await onLoadOrder(order);
  }

  async function handleSelectPaid(sale: PaidSale) {
    setDetailSale(sale);
    setDetailItems(null);
    const detail = await onLoadDetail(sale.id);
    setDetailItems(detail?.items ?? []);
  }

  function closeDetail() {
    setDetailSale(null);
    setDetailItems(null);
  }

  async function handleConfirmDelete(orderId: number) {
    const ok = await onDeleteOrder(orderId);
    if (ok) setConfirmDeleteId(null);
  }

  async function handleReprint(saleId: number) {
    if (printingId != null) return;
    setPrintingId(saleId);
    try {
      await onReprintReceipt(saleId);
    } finally {
      setPrintingId(null);
    }
  }

  /* ── Ticket vacío: explorador de órdenes ─── */
  if (cart.length === 0) {
    const nothingToShow =
      !ordersLoading && !paidLoading && orders.length === 0 && paidOrders.length === 0;

    return (
      <div className="tt-root">
        <TicketTabBar
          slots={slots}
          activeIndex={activeIndex}
          onSwitch={onSwitchTicket}
          onCreate={onCreateTicket}
          onClose={onCloseTicket}
        />

        {nothingToShow ? (
          <div className="tt-empty">
            <span className="tt-empty-icon">🧾</span>
            <p className="tt-empty-text">Ticket vacío</p>
            <p className="tt-empty-sub">Agregá productos desde el catálogo</p>
          </div>
        ) : (
          <div className="tt-browse">
            {/* ── Guardadas (pendientes) ── */}
            <section className="tt-section tt-section--saved">
              <header className="tt-section-head">
                <span className="tt-section-title">Órdenes guardadas</span>
                {orders.length > 0 && (
                  <span className="tt-section-count">{orders.length}</span>
                )}
              </header>

              {ordersLoading ? (
                <div className="tt-browse-loading"><Spinner size="sm" /></div>
              ) : orders.length === 0 ? (
                <p className="tt-browse-empty">No hay órdenes pendientes</p>
              ) : (
                <ul className="tt-browse-list">
                  {orders.map((order) => (
                    <li key={order.id}>
                      <div className="tt-browse-row tt-browse-row--saved">
                        <button
                          className="tt-browse-open"
                          onClick={() => handleSelectOrder(order)}
                        >
                          <span className="tt-browse-ref">
                            {order.reference || "Sin referencia"}
                            {order.monthly_number != null && (
                              <span className="tt-browse-num"> #{order.monthly_number}</span>
                            )}
                          </span>
                          <span className="tt-browse-meta">
                            {order.items_count ?? "?"} ítems · {formatTime(order.created_at)}
                          </span>
                        </button>

                        {confirmDeleteId === order.id ? (
                          <div className="tt-browse-confirm">
                            <button
                              className="tt-browse-confirm-yes"
                              disabled={deleting}
                              onClick={() => void handleConfirmDelete(order.id)}
                              aria-label="Confirmar eliminación"
                            >
                              {deleting ? <Spinner size="sm" /> : "Eliminar"}
                            </button>
                            <button
                              className="tt-browse-confirm-no"
                              disabled={deleting}
                              onClick={() => setConfirmDeleteId(null)}
                              aria-label="Cancelar"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            className="tt-browse-del"
                            onClick={() => setConfirmDeleteId(order.id)}
                            aria-label={`Eliminar orden ${order.reference || order.id}`}
                          >
                            <TrashIcon />
                          </button>
                        )}

                        <span className="tt-browse-total tabular">{fmt(toNum(order.total))}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ── Separador ── */}
            <div className="tt-section-sep" role="separator" />

            {/* ── Cobradas (hoy) ── */}
            <section className="tt-section tt-section--paid">
              <header className="tt-section-head">
                <span className="tt-section-title">Cobradas hoy</span>
                {paidOrders.length > 0 && (
                  <span className="tt-section-count tt-section-count--paid">{paidOrders.length}</span>
                )}
              </header>

              {paidLoading ? (
                <div className="tt-browse-loading"><Spinner size="sm" /></div>
              ) : paidOrders.length === 0 ? (
                <p className="tt-browse-empty">Aún no hay ventas cobradas hoy</p>
              ) : (
                <ul className="tt-browse-list">
                  {paidOrders.map((sale) => (
                    <li key={sale.id}>
                      <div className="tt-browse-row tt-browse-row--paid">
                        <button
                          className="tt-browse-open"
                          onClick={() => handleSelectPaid(sale)}
                        >
                          <span className="tt-browse-ref">
                            {sale.reference || "Sin referencia"}
                            {sale.monthly_number != null && (
                              <span className="tt-browse-num"> #{sale.monthly_number}</span>
                            )}
                          </span>
                          <span className="tt-browse-meta">
                            {sale.user_name} · {formatTime(sale.paid_at ?? sale.created_at)}
                          </span>
                        </button>

                        <button
                          className="tt-browse-print"
                          disabled={printingId != null}
                          onClick={() => void handleReprint(sale.id)}
                          aria-label={`Reimprimir recibo ${sale.reference || sale.id}`}
                        >
                          {printingId === sale.id ? <Spinner size="sm" /> : <PrinterIcon />}
                        </button>

                        <span className="tt-browse-total tabular">{fmt(toNum(sale.total))}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {/* ── Detalle de venta cobrada (solo lectura) ── */}
        <BottomSheet
          open={detailSale != null}
          onClose={closeDetail}
          title={
            detailSale
              ? `Venta ${detailSale.reference || "sin referencia"}${
                  detailSale.monthly_number != null ? ` #${detailSale.monthly_number}` : ""
                }`
              : "Detalle"
          }
          height="tall"
        >
          {detailItems == null ? (
            <div className="tt-orders-loading"><Spinner size="md" /></div>
          ) : detailItems.length === 0 ? (
            <p className="tt-orders-empty">Sin ítems</p>
          ) : (
            <>
              <ul className="tt-detail-list">
                {detailItems.map((item) => (
                  <li key={item.productId} className="tt-detail-item">
                    <span className="tt-detail-name">{item.name}</span>
                    <span className="tt-detail-qty">×{item.quantity}</span>
                    <span className="tt-detail-line tabular">{fmt(item.price * item.quantity)}</span>
                  </li>
                ))}
              </ul>
              {detailSale && (
                <div className="tt-detail-totals">
                  {toNum(detailSale.tip_amount) > 0 && (
                    <div className="tt-pay-row">
                      <span>Propina</span>
                      <span className="tabular">{fmt(toNum(detailSale.tip_amount))}</span>
                    </div>
                  )}
                  <div className="tt-pay-row tt-pay-row--total">
                    <span>Total</span>
                    <span className="tabular">{fmt(toNum(detailSale.total))}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </BottomSheet>
      </div>
    );
  }

  /* ── Ticket con ítems ────────────────────── */
  return (
    <div className="tt-root">
      <TicketTabBar
        slots={slots}
        activeIndex={activeIndex}
        onSwitch={onSwitchTicket}
        onCreate={onCreateTicket}
        onClose={onCloseTicket}
      />

      <div className="tt-header">
        <h2 className="tt-title">
          {currentOrderId != null ? "Orden guardada" : "Ticket"}
        </h2>
        <input
          className="tt-ref-input"
          placeholder="Mesa / referencia…"
          value={orderRef}
          onChange={(e) => setOrderRef(e.target.value)}
          maxLength={40}
        />
      </div>

      <ul className="tt-list" aria-label="Ítems del ticket">
        {cart.map((item) => (
          <li key={item.productId} className="tt-item">
            <div className="tt-item-main">
              <div className="tt-item-info">
                <p className="tt-item-name">{item.name}</p>
                <p className="tt-item-line">{fmt(item.price)} × {item.quantity}</p>
              </div>

              <div className="tt-qty">
                <button
                  className="tt-qty-btn"
                  onClick={() => decreaseQty(item.productId)}
                  aria-label={`Reducir ${item.name}`}
                >
                  −
                </button>
                <span className="tt-qty-val">{item.quantity}</span>
                <button
                  className="tt-qty-btn"
                  onClick={() => increaseQty(item.productId)}
                  aria-label={`Aumentar ${item.name}`}
                >
                  +
                </button>
              </div>

              <button
                className={`tt-note-btn${item.notes ? " tt-note-btn--active" : ""}`}
                onClick={() => setEditingNotesId(editingNotesId === item.productId ? null : item.productId)}
                aria-label={`Nota para ${item.name}`}
                title={item.notes ? `Nota: ${item.notes}` : "Agregar nota"}
              >
                📝
              </button>

              <button
                className="tt-remove"
                onClick={() => removeItem(item.productId)}
                aria-label={`Eliminar ${item.name}`}
              >
                ×
              </button>
            </div>

            {editingNotesId === item.productId ? (
              <input
                className="tt-note-input"
                autoFocus
                placeholder="Ej: sin hielo, bien fría…"
                value={item.notes || ""}
                onChange={(e) => setItemNotes(item.productId, e.target.value)}
                onBlur={() => setEditingNotesId(null)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditingNotesId(null); }}
                maxLength={120}
              />
            ) : item.notes ? (
              <button
                className="tt-note-chip"
                onClick={() => setEditingNotesId(item.productId)}
                aria-label={`Editar nota de ${item.name}`}
              >
                📝 {item.notes}
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="tt-footer">
        <div className="tt-general-note-wrap">
          <label className="tt-general-note-label" htmlFor="tt-general-note">📋 Nota general</label>
          <textarea
            id="tt-general-note"
            className="tt-general-note"
            placeholder="Ej: mesa 5, alérgico al maní…"
            value={orderNotes}
            onChange={(e) => setOrderNotes(e.target.value)}
            rows={2}
            maxLength={200}
          />
        </div>

        <div className="tt-totals">
          <div className="tt-total-row">
            <span>Subtotal</span>
            <span className="tabular">{fmt(cartTotal)}</span>
          </div>
          {tipPercentage > 0 && (
            <div className="tt-total-row">
              <span>Propina ({tipPercentage}%)</span>
              <span className="tabular">{fmt(tipAmount)}</span>
            </div>
          )}
          <div className="tt-total-row tt-total-row--main">
            <span>Total</span>
            <span className="tabular">{fmt(displayTotal)}</span>
          </div>
        </div>

        <div className="tt-kitchen-row">
          <button
            className="tt-kitchen-btn tt-kitchen-btn--kitchen tt-kitchen-btn--full"
            onClick={() => onPrintKitchen(printerMode === "dual" ? ["kitchen"] : ["kitchen", "bar"])}
            disabled={printLoading}
            title="Enviar a cocina"
          >
            {printLoading ? <Spinner size="sm" /> : "🍳"} Enviar a cocina
          </button>
          <button
            className={`tt-kitchen-btn tt-kitchen-btn--bar tt-kitchen-btn--full${printerMode !== "dual" ? " tt-kitchen-btn--inactive" : ""}`}
            onClick={() => onPrintKitchen(["bar"])}
            disabled={printLoading || printerMode !== "dual"}
            title={printerMode === "dual" ? "Enviar a barra" : "Barra desactivada"}
          >
            🥤 Enviar a barra
          </button>
        </div>

        <div className="tt-footer-actions">
          <Button
            variant="ghost"
            size="md"
            loading={saveLoading}
            disabled={payLoading || payNoTipLoading}
            onClick={onSave}
            className="tt-save-btn"
          >
            {currentOrderId != null ? "Actualizar" : "Guardar"}
          </Button>
          <Button
            variant="ghost"
            size="md"
            disabled={saveLoading || payLoading || payNoTipLoading}
            onClick={onSplit}
            className="tt-split-btn"
          >
            Dividir
          </Button>
          <Button
            variant="primary"
            size="lg"
            disabled={saveLoading}
            onClick={() => setPaySheetOpen(true)}
            className="tt-pay-btn"
          >
            Cobrar
          </Button>
        </div>
      </div>

      {/* ── Pay BottomSheet ─────────────────── */}
      <BottomSheet
        open={paySheetOpen}
        onClose={() => setPaySheetOpen(false)}
        title="Resumen de cobro"
      >
        <div className="tt-pay-amounts">
          <div className="tt-pay-row">
            <span>Subtotal</span>
            <span className="tabular">{fmt(cartTotal)}</span>
          </div>
          {tipPercentage > 0 && (
            <div className="tt-pay-row">
              <span>Propina ({tipPercentage}%)</span>
              <span className="tabular">{fmt(tipAmount)}</span>
            </div>
          )}
          <div className="tt-pay-row tt-pay-row--total">
            <span>Total a cobrar</span>
            <span className="tabular">{fmt(displayTotal)}</span>
          </div>
        </div>

        <div className="tt-pay-btns">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={payLoading}
            disabled={payNoTipLoading}
            onClick={() => handlePayButton(false)}
          >
            {tipPercentage > 0
              ? `Cobrar con propina — ${fmt(totalWithTip)}`
              : `Cobrar — ${fmt(cartTotal)}`}
          </Button>

          {tipPercentage > 0 && (
            <Button
              variant="secondary"
              size="md"
              fullWidth
              loading={payNoTipLoading}
              disabled={payLoading}
              onClick={() => handlePayButton(true)}
            >
              Cobrar — {fmt(cartTotal)}
            </Button>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
