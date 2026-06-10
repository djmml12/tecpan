// Tecpancito POS — Orders screen (lista de órdenes)

const { useState: useStateOrd, useMemo: useMemoOrd } = React;

const OrdersScreen = ({ orders, setOrders, onNewOrder, onOpenOrder, push }) => {
  const [filter, setFilter] = useStateOrd("all"); // all | open | paid
  const [search, setSearch] = useStateOrd("");

  const open = orders.filter(o => o.open);
  const paid = orders.filter(o => !o.open);

  // Group open by status for hierarchy
  const grouped = useMemoOrd(() => {
    const byStatus = { kitchen: [], bar: [], ready: [], served: [] };
    open.forEach(o => {
      const key = byStatus[o.status] ? o.status : "served";
      byStatus[key].push(o);
    });
    return byStatus;
  }, [open]);

  const updateStatus = (id, status) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    push(`Orden ${id} → ${window.TECPAN_STATUS[status]?.label || status}`, { icon: "check", variant: "ok" });
  };

  const markPaid = (id) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: "paid", open: false } : o));
    push("Orden cobrada", { icon: "money", variant: "ok" });
  };

  const deleteOrder = (id) => {
    setOrders(prev => prev.filter(o => o.id !== id));
    push("Orden eliminada", { icon: "trash", variant: "rec" });
  };

  // Total revenue today (from paid)
  const totalRevenue = paid.reduce((s, o) => s + (o.total || 0), 0);

  return (
    <div className="screen-orders">
      <header className="orders-header">
        <div className="orders-header-left">
          <h1 className="h1">Órdenes</h1>
          <div className="orders-counters">
            <div className="counter-pill">
              <span className="dot dot-warn dot-pulse" />
              <span className="counter-label">Abiertas</span>
              <span className="counter-val tnum">{open.length}</span>
            </div>
            <div className="counter-pill">
              <span className="dot dot-ok" />
              <span className="counter-label">Cobradas hoy</span>
              <span className="counter-val tnum">{paid.length}</span>
            </div>
            <div className="counter-pill counter-pill-revenue">
              <span className="counter-label">Ingresos</span>
              <span className="counter-val tnum t-display">Q {totalRevenue.toFixed(2)}</span>
            </div>
          </div>
        </div>
        <Button variant="primary" size="xl" icon="plus" onClick={onNewOrder}>
          Nueva venta
        </Button>
      </header>

      <div className="orders-filters">
        <div className="orders-search">
          <Field icon="search" placeholder="Buscar mesa, orden o ítem…" value={search} onChange={setSearch} />
        </div>
        <div className="orders-filter-pills">
          <Pill active={filter === "all"} onClick={() => setFilter("all")}>Todas</Pill>
          <Pill active={filter === "open"} onClick={() => setFilter("open")} count={open.length}>Abiertas</Pill>
          <Pill active={filter === "paid"} onClick={() => setFilter("paid")} count={paid.length}>Cobradas</Pill>
        </div>
      </div>

      <div className="orders-body">
        {(filter === "all" || filter === "open") && (
          <div className="orders-section">
            <div className="orders-section-head">
              <span className="upper muted">Abiertas</span>
              <span className="orders-section-count tnum">{open.length}</span>
            </div>

            {open.length === 0 ? (
              <div className="orders-empty">
                <Icon name="receipt" size={40} />
                <div>No hay órdenes abiertas</div>
                <Button variant="primary" size="md" icon="plus" onClick={onNewOrder} style={{marginTop: 12}}>
                  Iniciar venta
                </Button>
              </div>
            ) : (
              <div className="orders-grid">
                {["kitchen", "bar", "ready", "served"].map(statusKey => {
                  const list = grouped[statusKey];
                  if (!list || list.length === 0) return null;
                  const meta = window.TECPAN_STATUS[statusKey];
                  return (
                    <div key={statusKey} className={`orders-column orders-column-${meta.color}`}>
                      <div className="orders-column-head">
                        <span className={`dot dot-${meta.color === "muted" ? "warn" : meta.color} ${statusKey === "kitchen" ? "dot-pulse" : ""}`} />
                        <span className="orders-column-label">{meta.label}</span>
                        <span className="orders-column-count tnum">{list.length}</span>
                      </div>
                      <div className="orders-column-list">
                        {list.map(o => (
                          <OrderCard
                            key={o.id}
                            order={o}
                            onAdvance={(nextStatus) => updateStatus(o.id, nextStatus)}
                            onPay={() => markPaid(o.id)}
                            onDelete={() => deleteOrder(o.id)}
                            onOpen={() => onOpenOrder(o.id)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {(filter === "all" || filter === "paid") && (
          <div className="orders-section">
            <div className="orders-section-head">
              <span className="upper muted">Cobradas hoy</span>
              <span className="orders-section-count tnum">{paid.length}</span>
            </div>
            <div className="orders-paid-list">
              {paid.map(o => <PaidRow key={o.id} order={o} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── ORDER CARD (kanban-style) ──────────────────────────────── */
const OrderCard = ({ order, onAdvance, onPay, onDelete, onOpen }) => {
  const total = order.items.reduce((s, it) => s + (it.qty || 1) * (it.price || 0), 0);
  const itemCount = order.items.reduce((s, it) => s + (it.qty || 1), 0);

  // Next status logic
  const NEXT = {
    kitchen: { id: "ready", label: "Marcar lista", icon: "bell" },
    bar: { id: "ready", label: "Marcar lista", icon: "bell" },
    ready: { id: "served", label: "Entregada", icon: "check" },
    served: null,
  };
  const nextAction = NEXT[order.status];

  return (
    <div className="order-card nm-raised anim-fade-up">
      <button className="order-card-main" onClick={onOpen}>
        <div className="order-card-head">
          <div>
            <div className="order-card-label t-display">{order.label}</div>
            <div className="order-card-meta tnum">
              <span>{itemCount} ítem{itemCount === 1 ? "" : "s"}</span>
              <span className="dot-sep">·</span>
              <span>{order.createdAt}</span>
            </div>
          </div>
          <div className="order-card-total tnum t-display">Q {total.toFixed(2)}</div>
        </div>

        <div className="order-card-items">
          {order.items.slice(0, 3).map((it, i) => (
            <div key={i} className="order-card-item">
              <span className="order-card-item-qty tnum">{it.qty}×</span>
              <span className="order-card-item-name">{it.name}</span>
            </div>
          ))}
          {order.items.length > 3 && (
            <div className="order-card-item-more muted">+ {order.items.length - 3} más…</div>
          )}
        </div>
      </button>

      <div className="order-card-actions">
        {nextAction && (
          <Button
            variant="default"
            size="sm"
            icon={nextAction.icon}
            onClick={(e) => { e.stopPropagation(); onAdvance(nextAction.id); }}
            className="order-card-action-main"
          >
            {nextAction.label}
          </Button>
        )}
        <Button variant="primary" size="sm" icon="money" onClick={(e) => { e.stopPropagation(); onPay(); }} className="order-card-action-pay">
          Cobrar
        </Button>
        <Button variant="ghost" size="icon-sm" icon="trash" onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label="Eliminar" />
      </div>
    </div>
  );
};

/* ─── PAID ROW (compact) ─────────────────────────────────────── */
const PaidRow = ({ order }) => {
  const total = order.total || order.items.reduce((s, it) => s + (it.qty || 1) * (it.price || 0), 0);
  return (
    <div className="paid-row">
      <div className="paid-row-left">
        <span className="paid-row-label t-display">{order.label}</span>
        <span className="muted paid-row-meta">
          {order.items.length} ítem{order.items.length === 1 ? "" : "s"} · {order.createdAt}
        </span>
      </div>
      <div className="paid-row-right">
        <span className="paid-row-total tnum t-display">Q {total.toFixed(2)}</span>
        <Button variant="ghost" size="icon-sm" icon="print" aria-label="Reimprimir" />
        <Button variant="ghost" size="icon-sm" icon="chevronRight" aria-label="Ver" />
      </div>
    </div>
  );
};

Object.assign(window, { OrdersScreen, OrderCard, PaidRow });
