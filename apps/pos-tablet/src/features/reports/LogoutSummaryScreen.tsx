import { useEffect, useRef, useState } from "react";
import { Button, Spinner, useToast } from "@pos/ui-kit";
import { apiRequest } from "../../services/api";
import "./logout-summary.css";

/* ── Types ────────────────────────────────────────────────── */

interface SaleEntry {
  id:      number;
  label?:  string;
  total:   number;
  tip?:    number;
  method?: string;
  items?:  { qty?: number }[];
  createdAt?: string;
}

interface DailySummary {
  date:                string;
  sales:               SaleEntry[];
  total_sales_amount:  number;
  total_tips:          number;
  total_collected:     number;
  total_profit:        number;
}

interface Props {
  role?:             string;
  onContinueToLogin: () => void;
}

type ElectronCloseGuardAPI = {
  setCloseGuard?: (payload: { active: boolean; message?: string }) => void;
};

/* ── Helpers ──────────────────────────────────────────────── */

const fmt = (n: number) =>
  new Intl.NumberFormat("es-GT", {
    style: "currency",
    currency: "GTQ",
    minimumFractionDigits: 2,
  }).format(n);

/* ── Icons ────────────────────────────────────────────────── */

function EmailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>
    </svg>
  );
}

function PrintIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="14" width="12" height="8" rx="1"/>
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 9V3h12v6"/>
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <path d="M12 9v4M12 17h.01"/>
    </svg>
  );
}

/* ── Component ────────────────────────────────────────────── */

const empty: DailySummary = {
  date: "", sales: [],
  total_sales_amount: 0, total_tips: 0,
  total_collected: 0, total_profit: 0,
};

export default function LogoutSummaryScreen({ role, onContinueToLogin }: Props) {
  const { show }   = useToast();
  const mountedRef = useRef(true);

  const [summary,           setSummary]           = useState<DailySummary>(empty);
  const [loading,           setLoading]           = useState(true);
  const [sendingEmail,      setSendingEmail]      = useState(false);
  const [emailSendStarted,  setEmailSendStarted]  = useState(false);
  const [emailSentConfirmed,setEmailSentConfirmed]= useState(false);
  const [printLoading,      setPrintLoading]      = useState(false);
  const [confirmOpen,       setConfirmOpen]       = useState(false);

  const emailCloseLocked = emailSendStarted && !emailSentConfirmed;

  useEffect(() => {
    mountedRef.current = true;
    void apiRequest("/reports/logout-summary/today")
      .then((r: unknown) => {
        const d = r as Record<string, unknown>;
        if (mountedRef.current) setSummary((d?.data ?? d) as DailySummary ?? empty);
      })
      .catch(() => {
        if (mountedRef.current) show("No se pudo cargar el resumen", { type: "error" });
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
    return () => { mountedRef.current = false; };
  }, [show]);

  useEffect(() => {
    const message = "El resumen por email aún no ha sido confirmado. Reintenta antes de cerrar el POS.";
    const electronAPI = (window as unknown as { electronAPI?: ElectronCloseGuardAPI }).electronAPI;
    electronAPI?.setCloseGuard?.({ active: emailCloseLocked, message });
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!emailCloseLocked) return;
      event.preventDefault();
      event.returnValue = message;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (!emailCloseLocked) electronAPI?.setCloseGuard?.({ active: false });
    };
  }, [emailCloseLocked]);

  const handleEmail = async () => {
    setEmailSendStarted(true);
    setEmailSentConfirmed(false);
    setSendingEmail(true);
    try {
      await apiRequest("/reports/logout-summary/email", { method: "POST" });
      if (mountedRef.current) {
        setEmailSentConfirmed(true);
        show("Resumen enviado por correo", { type: "success" });
      }
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "No se pudo enviar", { type: "error" });
    } finally {
      if (mountedRef.current) setSendingEmail(false);
    }
  };

  const handlePrint = async () => {
    setPrintLoading(true);
    try {
      await apiRequest("/print/summary", { method: "POST", timeoutMs: 10_000 });
      if (mountedRef.current) show("Resumen enviado a la impresora", { type: "success" });
    } catch {
      if (mountedRef.current) show("Impresora no disponible — revisa configuración", { type: "error" });
    } finally {
      if (mountedRef.current) setPrintLoading(false);
    }
  };

  const isAdmin = String(role ?? "").toLowerCase() === "admin";

  const handleConfirm = () => {
    if (emailCloseLocked) {
      show("Espera la confirmación del email antes de terminar el día", { type: "warning" });
      return;
    }
    setConfirmOpen(true);
  };

  const ticketsCount = summary.sales.length;
  const margen = summary.total_sales_amount > 0
    ? Math.round((summary.total_profit / summary.total_sales_amount) * 100)
    : 0;

  const tipPct = summary.total_sales_amount > 0
    ? Math.round((summary.total_tips / summary.total_sales_amount) * 100)
    : 0;

  return (
    <div className="ls-shell">
      {/* Dotted background */}
      <div className="ls-bg" aria-hidden="true" />

      <section className="ls-card">

        {/* ── Header ──────────────────────────────── */}
        <header className="ls-header">
          <div className="ls-moon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>
            </svg>
          </div>
          <div className="ls-header-text">
            <h1 className="ls-title">Cierre del día</h1>
            <div className="ls-subtitle">
              {summary.date && <span>{summary.date}</span>}
            </div>
          </div>
        </header>

        {loading ? (
          <div className="ls-loading">
            <Spinner size="lg" />
            <span>Cargando resumen...</span>
          </div>
        ) : (
          <>
            {/* ── Stats grid ───────────────────────── */}
            <div className="ls-stats">
              <div className="ls-stat-card">
                <span className="ls-stat-label">Ventas totales</span>
                <span className="ls-stat-value tabular">{fmt(summary.total_sales_amount)}</span>
                <span className="ls-stat-delta">{ticketsCount} ticket{ticketsCount !== 1 ? "s" : ""}</span>
              </div>
              <div className="ls-stat-card">
                <span className="ls-stat-label">Propinas</span>
                <span className="ls-stat-value tabular">{fmt(summary.total_tips)}</span>
                <span className="ls-stat-delta">{tipPct}% de ventas</span>
              </div>
              <div className="ls-stat-card ls-stat-card--highlight">
                <span className="ls-stat-label">Total del día</span>
                <span className="ls-stat-value tabular">{fmt(summary.total_collected)}</span>
                <span className="ls-stat-delta">ventas + propinas</span>
              </div>
              <div className="ls-stat-card ls-stat-card--utility">
                <span className="ls-stat-label">Utilidad</span>
                <span className="ls-stat-value tabular">{fmt(summary.total_profit)}</span>
                <span className="ls-stat-delta">{margen}% margen</span>
              </div>
            </div>

            {/* ── Tips note ────────────────────────── */}
            {summary.total_tips > 0 && (
              <p className="ls-tips-note">
                * Las propinas son una cuenta aparte y no se incluyen en las utilidades.
              </p>
            )}

            {/* ── Sales list ───────────────────────── */}
            <div className="ls-section">
              <div className="ls-section-head">
                <span className="ls-section-label">Ventas del día</span>
                <span className={`ls-section-count${ticketsCount === 0 ? " ls-section-count--empty" : ""}`}>
                  {ticketsCount}
                </span>
              </div>

              <div className="ls-ventas-list">
                {summary.sales.length === 0 ? (
                  <div className="ls-empty">
                    <div className="ls-empty-icon">
                      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 2h14v20l-3-2-2 2-2-2-2 2-2-2-3 2zM8 7h8M8 11h8M8 15h5"/>
                      </svg>
                    </div>
                    <div>No hubo ventas hoy.</div>
                  </div>
                ) : (
                  summary.sales.map((sale, i) => (
                    <div key={sale.id} className="ls-venta-row">
                      <div className="ls-venta-num">{String(i + 1).padStart(2, "0")}</div>
                      <div className="ls-venta-info">
                        <div className="ls-venta-label">
                          {sale.label ? sale.label : `#${String(sale.id).padStart(3, "0")}`}
                        </div>
                        {sale.tip ? (
                          <div className="ls-venta-meta">+{fmt(sale.tip)} prop.</div>
                        ) : null}
                      </div>
                      <div className="ls-venta-amount tabular">{fmt(sale.total)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* ── Secondary actions ────────────────── */}
            <div className="ls-actions-grid">
              <Button variant="secondary" size="lg" fullWidth loading={printLoading} onClick={() => void handlePrint()}>
                <PrintIcon /><span>Imprimir resumen</span>
              </Button>
              {isAdmin && (
                <Button variant="secondary" size="lg" fullWidth loading={sendingEmail} onClick={() => void handleEmail()}>
                  <EmailIcon />
                  <span>{emailSentConfirmed ? "Email enviado ✓" : "Enviar por email"}</span>
                </Button>
              )}
            </div>

            {emailCloseLocked && (
              <p className="ls-email-lock-note">
                Esperando confirmación del email. No cierres el POS hasta que termine el envío.
              </p>
            )}

            {/* ── Primary CTA ──────────────────────── */}
            <div className="ls-cta-row">
              <Button variant="secondary" size="lg" onClick={() => window.history.back?.()}>
                Volver
              </Button>
              <Button
                variant="danger"
                size="xl"
                fullWidth
                disabled={emailCloseLocked || sendingEmail}
                onClick={handleConfirm}
              >
                <LogoutIcon /><span>Terminar día</span>
              </Button>
            </div>
          </>
        )}
      </section>

      {/* ── Confirm overlay ─────────────────────── */}
      {confirmOpen && (
        <div className="ls-confirm-back" onClick={e => { if (e.target === e.currentTarget) setConfirmOpen(false); }}>
          <div className="ls-confirm-card">
            <div className="ls-confirm-icon"><WarningIcon /></div>
            <h2 className="ls-confirm-title">¿Cerrar el día?</h2>
            <p className="ls-confirm-body">
              Vas a cerrar el día con <strong>{ticketsCount} ticket{ticketsCount !== 1 ? "s" : ""}</strong> y{" "}
              <strong>{fmt(summary.total_collected)}</strong> en total.{" "}
              Esta acción <strong>no se puede deshacer</strong>.
            </p>
            <div className="ls-confirm-actions">
              <Button variant="secondary" size="lg" fullWidth onClick={() => setConfirmOpen(false)}>
                Cancelar
              </Button>
              <Button variant="danger" size="lg" fullWidth onClick={onContinueToLogin}>
                Sí, terminar día
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
