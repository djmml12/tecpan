// Tecpancito POS — shared components & icons
// All Babel-transpiled, exported to window for cross-script use

const { useState, useEffect, useRef, useMemo, useCallback } = React;

/* ─── ICONS (line-style, 24px viewBox, currentColor) ─────────── */
const Icon = ({ name, size = 22, stroke = 2 }) => {
  const s = { width: size, height: size, fill: "none", stroke: "currentColor", strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round" };
  const paths = {
    cart: <><circle cx="9" cy="20" r="1.6"/><circle cx="18" cy="20" r="1.6"/><path d="M3 4h2l2.5 11.5a2 2 0 0 0 2 1.5h8.5a2 2 0 0 0 2-1.5L22 8H6"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    minus: <><path d="M5 12h14"/></>,
    trash: <><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/></>,
    edit: <><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></>,
    note: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    list: <><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></>,
    home: <><path d="m3 11 9-8 9 8v9a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z"/></>,
    receipt: <><path d="M5 2h14v20l-3-2-2 2-2-2-2 2-2-2-3 2zM8 7h8M8 11h8M8 15h5"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8"/></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></>,
    moon: <><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></>,
    chevronLeft: <><path d="m15 18-6-6 6-6"/></>,
    chevronRight: <><path d="m9 18 6-6-6-6"/></>,
    chevronDown: <><path d="m6 9 6 6 6-6"/></>,
    chevronUp: <><path d="m18 15-6-6-6 6"/></>,
    x: <><path d="M18 6 6 18M6 6l12 12"/></>,
    check: <><path d="M20 6 9 17l-5-5"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.36.15.68.39.94.7"/></>,
    flame: <><path d="M14.5 14.5c0-2.5-2.5-3-2.5-5 0-2 2-3 2-3s-3 0-5 2.5C7 11.5 6 13 6 14.5a6 6 0 1 0 12 0c0-3-3-5-3-5"/></>,
    bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/></>,
    glass: <><path d="M5 3h14l-2 11a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3zM12 17v4M8 21h8"/></>,
    money: <><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/></>,
    split: <><path d="M6 3v18M18 3v18M6 8h12M6 16h12"/></>,
    print: <><rect x="6" y="14" width="12" height="8" rx="1"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 9V3h12v6"/></>,
    pencil: <><path d="M17 3a2.85 2.85 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></>,
    arrowLeft: <><path d="M19 12H5M12 19l-7-7 7-7"/></>,
    flag: <><path d="M4 22V4a2 2 0 0 1 2-2h12l-3 6 3 6H6"/></>,
    package: <><path d="m7.5 4.27 9 5.15M21 8 12 13 3 8M3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8M12 22V12"/></>,
    chart: <><path d="M3 3v18h18M7 15l4-4 4 4 5-5"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    table: <><path d="M3 9h18M9 21V9M3 5h18v14H3z"/></>,
  };
  return <svg viewBox="0 0 24 24" style={s}>{paths[name] || null}</svg>;
};

/* ─── BUTTON ─────────────────────────────────────────────────── */
const Button = ({ variant = "default", size = "md", icon, iconRight, children, className = "", active = false, ...props }) => {
  const cls = [
    "btn",
    variant === "primary" && "btn-primary",
    variant === "danger" && "btn-danger",
    variant === "ghost" && "btn-ghost",
    size === "sm" && "btn-sm",
    size === "lg" && "btn-lg",
    size === "xl" && "btn-xl",
    size === "icon-sm" && "btn-icon btn-sm",
    size === "icon" && "btn-icon",
    size === "icon-lg" && "btn-icon btn-lg",
    active && "is-active",
    className,
  ].filter(Boolean).join(" ");
  const isIconOnly = size && size.startsWith("icon");
  return (
    <button className={cls} {...props}>
      {icon && <Icon name={icon} size={isIconOnly ? 22 : 18} />}
      {children}
      {iconRight && <Icon name={iconRight} size={18} />}
    </button>
  );
};

/* ─── PILL (category chip) ───────────────────────────────────── */
const Pill = ({ active, onClick, icon, count, children, className = "" }) => (
  <button className={`pill ${active ? "is-active" : ""} ${className}`} onClick={onClick}>
    {icon && <Icon name={icon} size={16} />}
    <span>{children}</span>
    {count != null && <span className="pill-count tnum">{count}</span>}
  </button>
);

/* ─── INPUT FIELD ────────────────────────────────────────────── */
const Field = ({ icon, placeholder, value, onChange, type = "text", className = "" }) => (
  <div className={`field ${className}`}>
    {icon && <Icon name={icon} size={18} />}
    <input type={type} placeholder={placeholder} value={value || ""} onChange={(e) => onChange?.(e.target.value)} />
  </div>
);

/* ─── SIDEBAR NAV (left rail) ────────────────────────────────── */
const SidebarNav = ({ current, onNav, openOrdersCount, onToggleTheme, dark }) => {
  const items = [
    { id: "pos", label: "POS", icon: "cart" },
    { id: "orders", label: "Órdenes", icon: "receipt", badge: openOrdersCount },
    { id: "tables", label: "Mesas", icon: "table", disabled: true },
    { id: "admin", label: "Admin", icon: "settings", disabled: true },
  ];
  return (
    <aside className="sidebar-nav">
      <div className="sidebar-brand">
        <BrandMark />
      </div>

      <div className="sidebar-items">
        {items.map(it => (
          <button
            key={it.id}
            className={`side-item ${current === it.id ? "is-active" : ""} ${it.disabled ? "is-disabled" : ""}`}
            onClick={() => !it.disabled && onNav(it.id)}
            disabled={it.disabled}
          >
            <div className="side-item-icon">
              <Icon name={it.icon} size={22} />
              {it.badge ? <span className="side-item-badge tnum">{it.badge}</span> : null}
            </div>
            <span className="side-item-label">{it.label}</span>
          </button>
        ))}
      </div>

      <div className="sidebar-foot">
        <button className="side-item" onClick={onToggleTheme} title={dark ? "Modo claro" : "Modo oscuro"}>
          <div className="side-item-icon"><Icon name={dark ? "sun" : "moon"} size={20} /></div>
          <span className="side-item-label">{dark ? "Claro" : "Oscuro"}</span>
        </button>
        <button className="side-item side-item-logout">
          <div className="side-item-icon"><Icon name="logout" size={20} /></div>
          <span className="side-item-label">Salir</span>
        </button>
      </div>
    </aside>
  );
};

/* ─── BRAND MARK (compact logo) ──────────────────────────────── */
const BrandMark = ({ size = 48 }) => (
  <img
    src="assets/logo-tecpancito.jpg"
    alt="Tecpancito"
    className="brand-mark-img"
    style={{ width: size, height: size, objectFit: "cover", borderRadius: 14, display: "block" }}
  />
);

/* ─── STATUS BADGE ───────────────────────────────────────────── */
const StatusBadge = ({ status }) => {
  const meta = window.TECPAN_STATUS[status] || { label: status, color: "muted", icon: "flag" };
  return (
    <span className={`badge badge-${meta.color}`}>
      <span className={`dot dot-${meta.color === "muted" ? "warn" : meta.color}`} style={{ width: 7, height: 7 }} />
      {meta.label}
    </span>
  );
};

/* ─── TOAST (simple, ephemeral) ──────────────────────────────── */
let toastSeq = 0;
const useToasts = () => {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, opts = {}) => {
    const id = ++toastSeq;
    setToasts(t => [...t, { id, msg, ...opts }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), opts.duration || 2400);
  }, []);
  return { toasts, push };
};

const ToastStack = ({ toasts }) => (
  <div className="toast-stack">
    {toasts.map(t => (
      <div key={t.id} className={`toast ${t.variant ? "toast-" + t.variant : ""}`}>
        {t.icon && <Icon name={t.icon} size={18} />}
        <span>{t.msg}</span>
      </div>
    ))}
  </div>
);

// Export
Object.assign(window, {
  Icon, Button, Pill, Field, SidebarNav, BrandMark, StatusBadge, ToastStack, useToasts,
});
