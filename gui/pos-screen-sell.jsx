// Tecpancito POS — Sell screen (toma de orden)

const { useState: useStateSell, useMemo: useMemoSell, useEffect: useEffectSell, useRef: useRefSell } = React;

const SellScreen = ({ cart, setCart, onSendOrder, density, push, orderLabel, setOrderLabel }) => {
  const [activeCat, setActiveCat] = useStateSell("todas");
  const [search, setSearch] = useStateSell("");
  const [showAllCats, setShowAllCats] = useStateSell(false);
  const [noteOpen, setNoteOpen] = useStateSell(false);
  const [generalNote, setGeneralNote] = useStateSell("");
  const [labelModal, setLabelModal] = useStateSell(false);

  const cats = window.TECPAN_CATEGORIES;
  const products = window.TECPAN_PRODUCTS;

  // Compute per-category counts
  const catCounts = useMemoSell(() => {
    const map = { todas: products.length };
    products.forEach(p => {
      map[p.cat] = (map[p.cat] || 0) + 1;
    });
    return map;
  }, [products]);

  // Filtered products
  const visible = useMemoSell(() => {
    let list = products;
    if (activeCat !== "todas") list = list.filter(p => p.cat === activeCat);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [activeCat, search, products]);

  // Cart actions
  const addToCart = (p) => {
    setCart(prev => {
      const ex = prev.find(it => it.id === p.id);
      if (ex) return prev.map(it => it.id === p.id ? { ...it, qty: it.qty + 1 } : it);
      return [...prev, { id: p.id, name: p.name, size: p.size, price: p.price, qty: 1, addedAt: new Date() }];
    });
    push(`+ ${p.name}${p.size ? " " + p.size : ""}`, { icon: "check", variant: "ok" });
  };
  const incQty = (id) => setCart(prev => prev.map(it => it.id === id ? { ...it, qty: it.qty + 1 } : it));
  const decQty = (id) => setCart(prev => prev.flatMap(it => {
    if (it.id !== id) return [it];
    if (it.qty <= 1) return [];
    return [{ ...it, qty: it.qty - 1 }];
  }));
  const removeItem = (id) => setCart(prev => prev.filter(it => it.id !== id));

  const total = cart.reduce((s, it) => s + it.qty * it.price, 0);
  const itemCount = cart.reduce((s, it) => s + it.qty, 0);

  // Categories: show first 9 by default, then "Ver todas" expands the rest into a wrap
  const PRIMARY_COUNT = 9;
  const primaryCats = cats.slice(0, PRIMARY_COUNT);
  const overflowCats = cats.slice(PRIMARY_COUNT);
  const hasOverflow = overflowCats.length > 0;

  return (
    <div className="screen-sell">
      {/* LEFT: search + categories + product grid */}
      <section className="sell-main">
        <header className="sell-header">
          <div className="sell-search">
            <Field icon="search" placeholder="Buscar producto…" value={search} onChange={setSearch} />
          </div>
          <Button
            size="md"
            icon={orderLabel ? "table" : "plus"}
            onClick={() => setLabelModal(true)}
            className="order-label-btn"
          >
            {orderLabel || "Asignar mesa"}
          </Button>
        </header>

        {/* Category chips — wrapping grid, expandable */}
        <div className={`sell-cats ${showAllCats ? "is-expanded" : ""}`}>
          <div className="sell-cats-row">
            {primaryCats.map(c => (
              <Pill
                key={c.id}
                active={activeCat === c.id}
                onClick={() => setActiveCat(c.id)}
                count={catCounts[c.id]}
              >
                {c.name}
              </Pill>
            ))}
            {hasOverflow && (
              <button
                className={`pill pill-toggle ${showAllCats ? "is-active" : ""}`}
                onClick={() => setShowAllCats(v => !v)}
              >
                <Icon name={showAllCats ? "chevronUp" : "chevronDown"} size={16} />
                <span>{showAllCats ? "Menos" : `+${overflowCats.length} más`}</span>
              </button>
            )}
          </div>
          {showAllCats && (
            <div className="sell-cats-row anim-fade-up">
              {overflowCats.map(c => (
                <Pill
                  key={c.id}
                  active={activeCat === c.id}
                  onClick={() => { setActiveCat(c.id); setShowAllCats(false); }}
                  count={catCounts[c.id]}
                >
                  {c.name}
                </Pill>
              ))}
            </div>
          )}
        </div>

        {/* Product grid */}
        <div className="sell-grid-wrap">
          <div className="sell-grid">
            {visible.map(p => (
              <ProductCard key={p.id} product={p} onAdd={() => addToCart(p)} cart={cart} />
            ))}
            {visible.length === 0 && (
              <div className="sell-empty">
                <Icon name="search" size={32} />
                <div>Sin resultados</div>
                <div className="muted">Intenta otra búsqueda o categoría</div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* RIGHT: current ticket */}
      <aside className="sell-cart nm-float">
        <div className="cart-header">
          <div className="cart-header-top">
            <span className="upper muted">Ticket actual</span>
            <div className="cart-header-meta">
              {orderLabel ? (
                <span className="cart-label-chip">
                  <Icon name="table" size={14} />
                  {orderLabel}
                </span>
              ) : (
                <span className="cart-label-chip muted">Sin mesa</span>
              )}
            </div>
          </div>
          <h2 className="h2 cart-header-title">
            {itemCount > 0 ? `${itemCount} ${itemCount === 1 ? "ítem" : "ítems"}` : "Nueva venta"}
          </h2>
        </div>

        <div className="cart-items-wrap">
          {cart.length === 0 ? (
            <div className="cart-empty">
              <div className="cart-empty-icon">
                <Icon name="cart" size={36} />
              </div>
              <div className="cart-empty-title">Agrega productos al ticket</div>
              <div className="muted" style={{fontSize: 13, textAlign:'center'}}>Toca cualquier producto del menú para iniciar la orden</div>
            </div>
          ) : (
            <div className="cart-items">
              {cart.map(it => (
                <CartRow
                  key={it.id}
                  item={it}
                  onInc={() => incQty(it.id)}
                  onDec={() => decQty(it.id)}
                  onRemove={() => removeItem(it.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Note + total + actions */}
        <div className="cart-footer">
          <div className={`cart-note ${noteOpen ? "is-open" : ""}`}>
            <button className="cart-note-toggle" onClick={() => setNoteOpen(o => !o)}>
              <Icon name="note" size={16} />
              <span>{generalNote ? "Nota agregada" : "Agregar nota general"}</span>
              <Icon name={noteOpen ? "chevronUp" : "chevronDown"} size={14} />
            </button>
            {noteOpen && (
              <div className="field cart-note-field anim-fade-up">
                <textarea
                  placeholder="Ej: alérgico al maní, sin chile…"
                  value={generalNote}
                  onChange={(e) => setGeneralNote(e.target.value)}
                  rows={2}
                />
              </div>
            )}
          </div>

          <div className="cart-total-row">
            <span className="upper muted">Total</span>
            <span className="cart-total tnum t-display">Q {total.toFixed(2)}</span>
          </div>

          <div className="cart-actions">
            <Button
              icon="split"
              variant="ghost"
              disabled={cart.length === 0}
              className="btn-block"
              size="md"
            >
              Dividir cuenta
            </Button>
            <Button
              icon="flame"
              variant="default"
              disabled={cart.length === 0}
              onClick={() => {
                onSendOrder(cart, generalNote, "kitchen");
                setCart([]); setGeneralNote(""); setNoteOpen(false);
                push("Orden enviada a cocina", { icon: "flame", variant: "warn" });
              }}
              className="btn-block btn-send"
              size="md"
            >
              Enviar a cocina
            </Button>
          </div>

          <Button
            variant="primary"
            disabled={cart.length === 0}
            onClick={() => {
              onSendOrder(cart, generalNote, "paid");
              setCart([]); setGeneralNote(""); setNoteOpen(false);
              push(`Cobrado Q ${total.toFixed(2)}`, { icon: "money", variant: "ok" });
            }}
            className="btn-block btn-charge"
            size="xl"
          >
            <Icon name="money" size={22} />
            Cobrar Q {total.toFixed(2)}
          </Button>
        </div>
      </aside>

      {/* Label modal */}
      {labelModal && (
        <LabelModal
          current={orderLabel}
          onConfirm={(label) => { setOrderLabel(label); setLabelModal(false); }}
          onClose={() => setLabelModal(false)}
        />
      )}
    </div>
  );
};

/* ─── PRODUCT CARD ───────────────────────────────────────────── */
const ProductCard = ({ product, onAdd, cart }) => {
  const inCart = cart.find(it => it.id === product.id);
  const lowStock = product.stock != null && product.stock < 10;
  const veryLow = product.stock != null && product.stock < 5;
  return (
    <button className={`product-card nm-raised ${inCart ? "is-in-cart" : ""} ${product.hot ? "is-hot" : ""}`} onClick={onAdd}>
      {product.hot && <span className="product-tag">★ Popular</span>}
      {inCart && <span className="product-qty-badge tnum">{inCart.qty}</span>}

      <div className="product-name t-display">{product.name}</div>
      {product.size && <div className="product-size">{product.size}</div>}

      <div className="product-foot">
        <div className="product-price tnum">
          <span className="q-symbol">Q</span>
          <span className="q-val">{product.price.toFixed(2)}</span>
        </div>
        {product.stock != null && (
          <div className={`product-stock tnum ${veryLow ? "is-critical" : lowStock ? "is-low" : ""}`}>
            {product.stock >= 999 ? "∞" : product.stock}
          </div>
        )}
      </div>
    </button>
  );
};

/* ─── CART ROW ───────────────────────────────────────────────── */
const CartRow = ({ item, onInc, onDec, onRemove }) => {
  return (
    <div className="cart-row anim-fade-up">
      <div className="cart-row-info">
        <div className="cart-row-name">{item.name}{item.size ? ` — ${item.size}` : ""}</div>
        <div className="cart-row-meta tnum">Q {item.price.toFixed(2)} c/u</div>
      </div>
      <div className="cart-row-actions">
        <div className="qty-stepper">
          <button className="qty-btn" onClick={onDec} aria-label="Restar">
            <Icon name="minus" size={16} />
          </button>
          <span className="qty-val tnum">{item.qty}</span>
          <button className="qty-btn" onClick={onInc} aria-label="Sumar">
            <Icon name="plus" size={16} />
          </button>
        </div>
        <button className="cart-remove" onClick={onRemove} aria-label="Eliminar">
          <Icon name="trash" size={16} />
        </button>
      </div>
      <div className="cart-row-total tnum t-display">Q {(item.qty * item.price).toFixed(2)}</div>
    </div>
  );
};

/* ─── LABEL MODAL (assign mesa) ──────────────────────────────── */
const LabelModal = ({ current, onConfirm, onClose }) => {
  const [input, setInput] = useStateSell(current || "");
  const mesas = Array.from({ length: 8 }, (_, i) => `Mesa ${i + 1}`);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal label-modal anim-fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle"></div>
        <div className="modal-header">
          <h2 className="h2">Nombre de la orden</h2>
          <button className="modal-close" onClick={onClose}><Icon name="x" size={20} /></button>
        </div>
        <div className="modal-body">
          <div className="mesa-grid">
            {mesas.map(m => (
              <button key={m} className={`mesa-tile ${input === m ? "is-active" : ""}`} onClick={() => setInput(m)}>
                <Icon name="table" size={20} />
                <span>{m}</span>
              </button>
            ))}
            <button className={`mesa-tile mesa-tile-other ${input && !mesas.includes(input) ? "is-active" : ""}`} onClick={() => setInput("Para llevar")}>
              <Icon name="package" size={20} />
              <span>Para llevar</span>
            </button>
          </div>
          <Field placeholder="O escribe un nombre personalizado…" value={input} onChange={setInput} />
        </div>
        <div className="modal-footer">
          <Button variant="ghost" size="lg" onClick={onClose} className="btn-block">Cancelar</Button>
          <Button variant="primary" size="lg" onClick={() => onConfirm(input || "Sin mesa")} disabled={!input} className="btn-block">
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { SellScreen, ProductCard, CartRow, LabelModal });
