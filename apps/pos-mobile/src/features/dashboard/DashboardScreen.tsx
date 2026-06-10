import { useCallback, useEffect, useRef, useState } from "react";
import { Spinner, useToast } from "@pos/ui-kit";
import { apiRequest } from "@pos/api-client";
import { fmt, toNum } from "@pos/pos-core";
import "./dashboard.css";

/* ── Tipos ────────────────────────────────────────────────── */

interface CriticalItem { name: string; stock: number; }
interface SoldItem      { name: string; quantity: number; }

interface DashboardData {
  totalSales:     number;
  totalProfit:    number;
  totalTips:      number;
  avgTicket:      number;
  salesCount:     number;
  totalCollected: number;
  critical:       CriticalItem[];
  topProducts:    SoldItem[];
}

/* ── Helpers ──────────────────────────────────────────────── */

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const unwrapData = (raw: unknown): Record<string, unknown> => {
  if (raw && typeof raw === "object" && "data" in raw) {
    return (raw as { data: Record<string, unknown> }).data ?? {};
  }
  return (raw ?? {}) as Record<string, unknown>;
};

const todayLabel = (): string =>
  new Date().toLocaleDateString("es-GT", {
    weekday: "long", day: "2-digit", month: "long",
  });

/* ── Iconos ───────────────────────────────────────────────── */

function RefreshIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* ── Componente ───────────────────────────────────────────── */

export default function DashboardScreen() {
  const { show } = useToast();
  const mountedRef = useRef(true);

  const [data,    setData]    = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true); else setLoading(true);
    try {
      const [dashRaw, sumRaw] = await Promise.all([
        apiRequest("/reports/dashboard"),
        apiRequest("/reports/logout-summary/today"),
      ]);
      const dash = unwrapData(dashRaw);
      const sum  = unwrapData(sumRaw);

      const critical = Array.isArray(dash.critical_list)
        ? (dash.critical_list as unknown[]).map((c) => {
            const r = c as Record<string, unknown>;
            return { name: String(r.name ?? ""), stock: num(r.stock) };
          })
        : [];

      const topProducts = Array.isArray(sum.sold_products)
        ? (sum.sold_products as unknown[]).map((p) => {
            const r = p as Record<string, unknown>;
            return { name: String(r.name ?? ""), quantity: num(r.quantity) };
          })
        : [];

      const next: DashboardData = {
        totalSales:     num(dash.total_sales),
        totalProfit:    num(dash.total_profit),
        totalTips:      num(dash.total_tips),
        avgTicket:      num(dash.avg_ticket),
        salesCount:     Array.isArray(sum.sales) ? (sum.sales as unknown[]).length : 0,
        totalCollected: num(sum.total_collected),
        critical,
        topProducts,
      };

      if (mountedRef.current) setData(next);
    } catch (err: unknown) {
      if (mountedRef.current) show(err instanceof Error ? err.message : "Error cargando el resumen", { type: "error" });
    } finally {
      if (mountedRef.current) { setLoading(false); setRefreshing(false); }
    }
  }, [show]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="db-root">
        <div className="db-center"><Spinner size="lg" /></div>
      </div>
    );
  }

  const d = data ?? {
    totalSales: 0, totalProfit: 0, totalTips: 0, avgTicket: 0,
    salesCount: 0, totalCollected: 0, critical: [], topProducts: [],
  };

  const margin = d.totalSales > 0 ? (d.totalProfit / d.totalSales) * 100 : 0;
  const topMax = d.topProducts.reduce((m, p) => Math.max(m, p.quantity), 0) || 1;
  const topList = d.topProducts.slice(0, 5);

  return (
    <div className="db-root">
      {/* ── Header ── */}
      <header className="db-header">
        <div>
          <h1 className="db-title">Resumen del día</h1>
          <p className="db-date">{todayLabel()}</p>
        </div>
        <button
          className={`db-refresh${refreshing ? " db-refresh--spin" : ""}`}
          onClick={() => void load(true)}
          aria-label="Actualizar"
          disabled={refreshing}
        >
          <RefreshIcon />
        </button>
      </header>

      <div className="db-scroll">
        {/* ── HERO: Ventas del día ── */}
        <section className="db-hero">
          <span className="db-hero-label">Ventas del día</span>
          <span className="db-hero-value">{fmt(toNum(d.totalSales))}</span>
          <div className="db-hero-foot">
            <span>{d.salesCount} {d.salesCount === 1 ? "venta" : "ventas"}</span>
            <span className="db-hero-dot" />
            <span>Ticket prom. {fmt(toNum(d.avgTicket))}</span>
          </div>
        </section>

        {/* ── Ganancias del día ── */}
        <section className="db-profit">
          <div className="db-profit-main">
            <span className="db-profit-label">Ganancia del día</span>
            <span className="db-profit-value">{fmt(toNum(d.totalProfit))}</span>
          </div>
          <div className="db-profit-badge">{margin.toFixed(0)}%<span>margen</span></div>
        </section>

        {/* ── Stats secundarios ── */}
        <section className="db-stats">
          <div className="db-stat">
            <span className="db-stat-val">{fmt(toNum(d.totalTips))}</span>
            <span className="db-stat-label">Propinas</span>
          </div>
          <div className="db-stat">
            <span className="db-stat-val">{fmt(toNum(d.totalCollected))}</span>
            <span className="db-stat-label">Total cobrado</span>
          </div>
        </section>

        {/* ── Lo más vendido ── */}
        <section className="db-section">
          <div className="db-section-head">
            <TrophyIcon />
            <h2>Lo más vendido</h2>
          </div>
          {topList.length === 0 ? (
            <p className="db-section-empty">Aún no hay ventas hoy</p>
          ) : (
            <div className="db-top-list">
              {topList.map((p, i) => (
                <div key={p.name + i} className={`db-top${i === 0 ? " db-top--first" : ""}`}>
                  <span className="db-top-rank">{i + 1}</span>
                  <div className="db-top-body">
                    <span className="db-top-name">{p.name}</span>
                    <span className="db-top-bar">
                      <span className="db-top-bar-fill" style={{ width: `${(p.quantity / topMax) * 100}%` }} />
                    </span>
                  </div>
                  <span className="db-top-qty">{p.quantity}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Productos críticos ── */}
        <section className="db-section">
          <div className="db-section-head">
            <AlertIcon />
            <h2>Productos críticos</h2>
            {d.critical.length > 0 && <span className="db-crit-count">{d.critical.length}</span>}
          </div>
          {d.critical.length === 0 ? (
            <div className="db-ok">
              <CheckIcon />
              <span>Todo en orden · sin stock crítico</span>
            </div>
          ) : (
            <div className="db-crit-list">
              {d.critical.map((c, i) => (
                <div key={c.name + i} className="db-crit">
                  <span className="db-crit-name">{c.name}</span>
                  <span className={`db-crit-stock${c.stock <= 0 ? " db-crit-stock--out" : ""}`}>
                    {c.stock <= 0 ? "Agotado" : `${c.stock} u`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="db-bottom-pad" />
      </div>
    </div>
  );
}
