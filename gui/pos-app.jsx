// Tecpancito POS — Root App

const { useState: useStateApp, useEffect: useEffectApp, useMemo: useMemoApp } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "typo": "rustica",
  "density": "comoda",
  "dark": false
}/*EDITMODE-END*/;

const App = () => {
  const tweaks = useTweaks(TWEAK_DEFAULTS);
  const t = tweaks.values;

  // Persist theme in localStorage too (independent of tweaks panel state)
  const [dark, setDark] = useStateApp(() => {
    const stored = localStorage.getItem("tecpan-dark");
    if (stored !== null) return stored === "1";
    return t.dark;
  });
  useEffectApp(() => {
    localStorage.setItem("tecpan-dark", dark ? "1" : "0");
  }, [dark]);

  // Apply theme classes and tweak attrs on root <div>
  const tecpanClass = `tecpan ${dark ? "tecpan-dark" : "tecpan-light"}`;

  // Toasts
  const { toasts, push } = useToasts();

  // Nav state
  const [screen, setScreen] = useStateApp("pos"); // pos | orders

  // Cart state
  const [cart, setCart] = useStateApp([]);
  const [orderLabel, setOrderLabel] = useStateApp(""); // current mesa label

  // Orders state — persist with localStorage
  const [orders, setOrders] = useStateApp(() => {
    try {
      const stored = localStorage.getItem("tecpan-orders");
      if (stored) return JSON.parse(stored);
    } catch {}
    return window.TECPAN_ORDERS_SEED;
  });
  useEffectApp(() => {
    localStorage.setItem("tecpan-orders", JSON.stringify(orders));
  }, [orders]);

  const openOrdersCount = orders.filter(o => o.open).length;

  const handleSendOrder = (items, note, status) => {
    const total = items.reduce((s, it) => s + it.qty * it.price, 0);
    const newOrder = {
      id: "o-" + Date.now(),
      label: orderLabel || `Orden ${orders.filter(o => !o.label?.startsWith("Mesa")).length + 1}`,
      createdAt: new Date().toLocaleTimeString("es-GT", { hour: "numeric", minute: "2-digit" }),
      items: items.map(it => ({ id: it.id, name: it.name + (it.size ? " " + it.size : ""), qty: it.qty, price: it.price })),
      status,
      open: status !== "paid",
      sentTo: ["cocina"],
      total,
      note: note || undefined,
    };
    setOrders(prev => [newOrder, ...prev]);
    setOrderLabel("");
  };

  const handleNewOrder = () => {
    setCart([]);
    setOrderLabel("");
    setScreen("pos");
  };

  const handleOpenOrder = (orderId) => {
    const o = orders.find(x => x.id === orderId);
    if (!o) return;
    push(`Abriendo ${o.label}`, { icon: "receipt" });
    // For a real impl: load order back into cart for edit. Keep simple here.
  };

  // Toggle theme — also sync with tweaks
  const toggleTheme = () => {
    setDark(d => {
      tweaks.set('dark', !d);
      return !d;
    });
  };

  // Reset all (dev convenience, double-tap brand)
  const [resetClicks, setResetClicks] = useStateApp(0);
  const handleBrandClick = () => {
    setResetClicks(c => c + 1);
    if (resetClicks >= 2) {
      setOrders(window.TECPAN_ORDERS_SEED);
      setCart([]);
      setOrderLabel("");
      setResetClicks(0);
      push("POS reiniciado", { icon: "check", variant: "ok" });
    }
    setTimeout(() => setResetClicks(0), 2000);
  };

  return (
    <div className={tecpanClass} data-typo={t.typo} data-density={t.density}>
      <SidebarNav
        current={screen}
        onNav={setScreen}
        openOrdersCount={openOrdersCount}
        onToggleTheme={toggleTheme}
        dark={dark}
      />

      {screen === "pos" && (
        <SellScreen
          cart={cart}
          setCart={setCart}
          onSendOrder={handleSendOrder}
          density={t.density}
          push={push}
          orderLabel={orderLabel}
          setOrderLabel={setOrderLabel}
        />
      )}

      {screen === "orders" && (
        <OrdersScreen
          orders={orders}
          setOrders={setOrders}
          onNewOrder={handleNewOrder}
          onOpenOrder={handleOpenOrder}
          push={push}
        />
      )}

      <ToastStack toasts={toasts} />

      {/* Tweaks panel */}
      <TweaksPanel title="Tweaks">
        <TweakSection title="Tipografía">
          <TweakRadio
            label="Estilo de display"
            sublabel="Aplica a títulos, precios, totales"
            options={[
              { value: "rustica", label: "Rústica" },
              { value: "limpia", label: "Limpia" },
            ]}
            value={t.typo}
            onChange={(v) => tweaks.set('typo', v)}
          />
        </TweakSection>

        <TweakSection title="Densidad">
          <TweakRadio
            label="Tamaño de tarjetas"
            sublabel="Más productos visibles vs más cómodo al tacto"
            options={[
              { value: "compacta", label: "Compacta" },
              { value: "comoda", label: "Cómoda" },
            ]}
            value={t.density}
            onChange={(v) => tweaks.set('density', v)}
          />
        </TweakSection>

        <TweakSection title="Tema">
          <TweakToggle
            label="Modo oscuro"
            sublabel="Ideal para servicio nocturno"
            value={dark}
            onChange={(v) => { setDark(v); tweaks.set('dark', v); }}
          />
        </TweakSection>

        <TweakSection title="Acciones rápidas">
          <TweakButton onClick={() => {
            setOrders(window.TECPAN_ORDERS_SEED);
            setCart([]);
            setOrderLabel("");
            push("Datos de demo restaurados", { variant: "ok" });
          }}>
            Restaurar datos de demo
          </TweakButton>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
};

// Mount
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
