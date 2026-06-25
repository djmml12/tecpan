import { useEffect, useRef, useState } from "react";
import { useCatalog, useMultiTicket, useCheckout, useOrders, usePrinting } from "@pos/pos-core";
import type { SavedOrder, KitchenTarget } from "@pos/pos-core";
import { apiRequest } from "@pos/api-client";
import { useAuth } from "@pos/auth";
import CatalogTab      from "../features/pos/CatalogTab";
import TicketTab       from "../features/pos/TicketTab";
import SplitBillSheet  from "../features/pos/SplitBillSheet";
import AccountTab      from "../features/account/AccountTab";
import AdminInventory  from "../features/admin/AdminInventory";
import DashboardScreen from "../features/dashboard/DashboardScreen";
import CompletedScreen from "../features/pos/CompletedScreen";
import "./mobile-shell.css";

type Tab = "pos" | "ticket" | "resumen" | "admin" | "account";

/* ── Icons ───────────────────────────────────────────────── */

function GridIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function InventoryIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

/* ── Shell ───────────────────────────────────────────────── */

interface MobileShellProps {
  onLogout: () => void;
}

export default function MobileShell({ onLogout }: MobileShellProps) {
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const [activeTab,       setActiveTab]       = useState<Tab>("pos");
  const [completedTotal,  setCompletedTotal]  = useState<number | null>(null);
  const [completedSaleId, setCompletedSaleId] = useState<number | null>(null);
  const [showSplit,       setShowSplit]       = useState(false);
  const [printerMode,     setPrinterMode]     = useState<"single" | "dual">("single");
  const printerModeFetched = useRef(false);

  const catalog  = useCatalog();
  const ticket   = useMultiTicket();
  const checkout = useCheckout();
  const orders   = useOrders();
  const printing = usePrinting();

  const { refresh: refreshOrders, refreshPaid } = orders;

  /* Carga la lista de órdenes y el modo de impresora al montar. */
  useEffect(() => {
    void refreshOrders();
    void refreshPaid();
  }, [refreshOrders, refreshPaid]);

  useEffect(() => {
    if (printerModeFetched.current) return;
    printerModeFetched.current = true;
    void (apiRequest("/settings/printer-mode") as Promise<{ mode?: string }>)
      .then((res) => {
        if (res?.mode === "dual") setPrinterMode("dual");
      })
      .catch(() => { /* modo single por defecto */ });
  }, []);

  /* Badge: número de tickets abiertos con al menos un ítem. */
  const ticketCount = ticket.slots.filter(s => s.cart.length > 0).length;

  /* ── Cobrar ─────────────────────────────── */
  async function handlePay(noTip: boolean): Promise<void> {
    const cartTotalSnap = ticket.cartTotal;
    const result = await checkout.payOrder({
      cart:           ticket.cart,
      cartTotal:      ticket.cartTotal,
      currentOrderId: ticket.currentOrderId,
      orderRef:       ticket.orderRef,
      orderNotes:     ticket.orderNotes,
      noTip,
    });
    if (!result) return;
    const saleId = result.id ?? null;
    ticket.clearAfterPay();
    void refreshOrders();
    setCompletedSaleId(saleId);
    setCompletedTotal(cartTotalSnap + Number(result.tip_amount ?? 0));
  }

  /* ── Guardar orden ──────────────────────── */
  async function handleSave(): Promise<void> {
    const result = await checkout.saveOrder({
      cart:           ticket.cart,
      cartTotal:      ticket.cartTotal,
      currentOrderId: ticket.currentOrderId,
      orderRef:       ticket.orderRef,
      orderNotes:     ticket.orderNotes,
    });
    if (result) {
      ticket.applySavedOrder(result);
      void refreshOrders();
    }
  }

  /* ── Cargar orden guardada ──────────────── */
  async function handleLoadOrder(order: SavedOrder): Promise<void> {
    const detail = await orders.loadOrderDetail(order.id);
    if (!detail) return;
    ticket.loadOrder({
      items:      detail.items,
      notes:      detail.notes,
      orderId:    order.id,
      monthlyNum: order.monthly_number ?? null,
      reference:  order.reference ?? "",
    });
  }

  /* ── Imprimir cocina / barra desde el ticket activo ──── */
  async function handlePrintKitchen(targets: KitchenTarget[]) {
    let orderId = ticket.currentOrderId;
    if (orderId == null) {
      const result = await checkout.saveOrder({
        cart:           ticket.cart,
        cartTotal:      ticket.cartTotal,
        currentOrderId: null,
        orderRef:       ticket.orderRef,
        orderNotes:     ticket.orderNotes,
      });
      if (!result) return;
      ticket.applySavedOrder(result);
      void refreshOrders();
      orderId = result.id;
    }
    void printing.sendKitchenTicket(orderId, targets);
  }

  /* ── Nuevo ticket (tras cobro exitoso) ───── */
  function handleNewTicket() {
    /* Si hay otros tabs abiertos, cerrar el pagado; si es el único, resetearlo. */
    if (ticket.slots.length > 1) {
      ticket.closeTicket(ticket.activeIndex);
    } else {
      ticket.resetTicket();
    }
    setCompletedTotal(null);
    setCompletedSaleId(null);
  }

  return (
    <div className="ms-shell">
      <main className="ms-content">
        {activeTab === "pos" && (
          <CatalogTab
            filteredProducts={catalog.filteredProducts}
            categories={catalog.categories}
            loading={catalog.loading}
            search={catalog.search}
            setSearch={catalog.setSearch}
            selectedCat={catalog.selectedCat}
            setSelectedCat={catalog.setSelectedCat}
            onAdd={(p) => ticket.addToCart(p)}
            flashId={ticket.flashId}
          />
        )}
        {activeTab === "ticket" && (
          <TicketTab
            cart={ticket.cart}
            cartTotal={ticket.cartTotal}
            currentOrderId={ticket.currentOrderId}
            orderRef={ticket.orderRef}
            setOrderRef={ticket.setOrderRef}
            orderNotes={ticket.orderNotes}
            setOrderNotes={ticket.setOrderNotes}
            setItemNotes={ticket.setItemNotes}
            increaseQty={ticket.increaseQty}
            decreaseQty={ticket.decreaseQty}
            removeItem={ticket.removeItem}
            tipPercentage={checkout.tipPercentage}
            payLoading={checkout.payLoading}
            payNoTipLoading={checkout.payNoTipLoading}
            saveLoading={checkout.saveLoading}
            orders={orders.orders}
            ordersLoading={orders.loading}
            paidOrders={orders.paidOrders}
            paidLoading={orders.loadingPaid}
            onPay={handlePay}
            onSave={handleSave}
            onSplit={() => setShowSplit(true)}
            onLoadOrder={handleLoadOrder}
            onDeleteOrder={orders.cancelOrder}
            deleting={orders.canceling}
            onReprintReceipt={printing.printReceipt}
            onRefreshOrders={refreshOrders}
            onRefreshPaid={refreshPaid}
            onLoadDetail={orders.loadOrderDetail}
            printerMode={printerMode}
            printLoading={printing.printLoading}
            onPrintKitchen={handlePrintKitchen}
            slots={ticket.slots}
            activeIndex={ticket.activeIndex}
            onCreateTicket={ticket.createTicket}
            onSwitchTicket={ticket.switchTicket}
            onCloseTicket={ticket.closeTicket}
          />
        )}
        {activeTab === "resumen" && isAdmin && <DashboardScreen />}
        {activeTab === "admin" && isAdmin && (
          <AdminInventory onChanged={() => void catalog.refresh()} />
        )}
        {activeTab === "account" && <AccountTab onLogout={onLogout} />}
      </main>

      <nav className="ms-nav" role="navigation" aria-label="Navegación principal">
        <button
          className={`ms-tab${activeTab === "pos" ? " ms-tab--active" : ""}`}
          onClick={() => setActiveTab("pos")}
          aria-current={activeTab === "pos" ? "page" : undefined}
        >
          <GridIcon />
          <span>Catálogo</span>
        </button>

        <button
          className={`ms-tab${activeTab === "ticket" ? " ms-tab--active" : ""}`}
          onClick={() => setActiveTab("ticket")}
          aria-current={activeTab === "ticket" ? "page" : undefined}
        >
          <span className="ms-tab-icon-wrap">
            <ReceiptIcon />
            {ticketCount > 0 && (
              <span className="ms-badge">{ticketCount > 9 ? "9+" : ticketCount}</span>
            )}
          </span>
          <span>Ticket</span>
        </button>

        {isAdmin && (
          <button
            className={`ms-tab${activeTab === "resumen" ? " ms-tab--active" : ""}`}
            onClick={() => setActiveTab("resumen")}
            aria-current={activeTab === "resumen" ? "page" : undefined}
          >
            <ChartIcon />
            <span>Resumen</span>
          </button>
        )}

        {isAdmin && (
          <button
            className={`ms-tab${activeTab === "admin" ? " ms-tab--active" : ""}`}
            onClick={() => setActiveTab("admin")}
            aria-current={activeTab === "admin" ? "page" : undefined}
          >
            <InventoryIcon />
            <span>Inventario</span>
          </button>
        )}

        <button
          className={`ms-tab${activeTab === "account" ? " ms-tab--active" : ""}`}
          onClick={() => setActiveTab("account")}
          aria-current={activeTab === "account" ? "page" : undefined}
        >
          <UserIcon />
          <span>Cuenta</span>
        </button>
      </nav>

      <SplitBillSheet
        open={showSplit}
        onClose={() => setShowSplit(false)}
        cart={ticket.cart}
        cartTotal={ticket.cartTotal}
        tipPercentage={checkout.tipPercentage}
        onAllPaid={(saleId) => {
          const totalSnap = ticket.cartTotal;
          const orderId   = ticket.currentOrderId;
          ticket.clearAfterPay();
          void refreshOrders();
          setShowSplit(false);
          setCompletedSaleId(saleId);
          setCompletedTotal(totalSnap);
          if (orderId != null) {
            void apiRequest(`/sales/${orderId}/cancel`, { method: "POST" }).catch(() => {});
          }
        }}
      />

      {completedTotal !== null && (
        <CompletedScreen
          total={completedTotal}
          saleId={completedSaleId}
          printLoading={printing.printLoading}
          onPrintReceipt={() => completedSaleId != null && void printing.printReceipt(completedSaleId)}
          onDismiss={handleNewTicket}
        />
      )}
    </div>
  );
}
