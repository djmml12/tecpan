import { useEffect, useState } from "react";
import { Button } from "@pos/ui-kit";
import { LoginKeyboard } from "./LoginKeyboard";
import { apiRequest, getBackendBaseUrl } from "../../services/api";
import { useAuth } from "@pos/auth";
import type { AuthUser } from "@pos/types";
import "./login.css";

/* ── Icons ──────────────────────────────────────────────── */

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" /><path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    </svg>
  );
}

function KeyboardOnIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6" />
    </svg>
  );
}

function KeyboardOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

/* ── Component ──────────────────────────────────────────── */

export default function LoginPage() {
  const { login } = useAuth();

  const [identifier,   setIdentifier]   = useState("");
  const [password,     setPassword]     = useState("");
  const [error,        setError]        = useState("");
  const [loading,      setLoading]      = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [backendUrl,   setBackendUrl]   = useState("");
  const [clockTime,    setClockTime]    = useState("");
  const [clockDate,    setClockDate]    = useState("");

  /* Clock tick */
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClockTime(now.toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit", hour12: false }));
      setClockDate(now.toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" }).replace(".", ""));
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    getBackendBaseUrl().then(url => { if (url) setBackendUrl(url); }).catch(() => {});
  }, []);

  const handleLogin = async () => {
    if (loading) return;
    const trimmedId = identifier.trim();
    if (!trimmedId || !password) {
      setError("Completa usuario y contraseña.");
      navigator.vibrate?.([10, 80, 10]);
      return;
    }
    try {
      setLoading(true);
      setError("");
      const data = await apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier: trimmedId, password }),
      }) as { token: string; user: AuthUser };
      setShowKeyboard(false);
      login(data.user, data.token);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al ingresar";
      setError(msg);
      navigator.vibrate?.([10, 80, 10]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lp-shell">

      {/* ── LEFT: Brand showcase ── */}
      <section className="lp-brand">
        <div className="lp-brand-bg" />

        {/* Decorative mountain silhouette */}
        <div className="lp-brand-mountains" aria-hidden="true">
          <svg viewBox="0 0 1200 400" preserveAspectRatio="none">
            <path d="M0 320 L120 260 L220 290 L340 220 L460 270 L580 200 L700 240 L820 180 L940 230 L1060 190 L1200 240 L1200 400 L0 400 Z" fill="currentColor" opacity="0.5" />
            <path d="M0 360 L100 320 L240 340 L380 290 L520 330 L660 280 L780 310 L920 270 L1050 300 L1200 280 L1200 400 L0 400 Z" fill="currentColor" opacity="0.8" />
          </svg>
        </div>

        <div className="lp-brand-content">
          <div className="lp-brand-card">
            <div className="lp-brand-logo">
              <img
                src={`${import.meta.env.BASE_URL}logo.jpeg`}
                alt="Tecpancito Restaurante"
                className="lp-brand-logo-img"
              />
            </div>

            <div className="lp-brand-stats">
              <div className="lp-brand-stat">
                <span className="lp-brand-stat-val tabular">{clockTime || "—"}</span>
                <span className="lp-brand-stat-label">Hora actual</span>
              </div>
              <div className="lp-brand-stat-divider" />
              <div className="lp-brand-stat">
                <span className="lp-brand-stat-val">{clockDate || "—"}</span>
                <span className="lp-brand-stat-label">Fecha</span>
              </div>
            </div>
          </div>

          <div className="lp-brand-foot">
            <span className="lp-brand-foot-dot" />
            <span>Sistema en línea</span>
          </div>
        </div>
      </section>

      {/* ── RIGHT: Form ── */}
      <section className="lp-form-wrap">
        <div className="lp-form-container">
          <div className="lp-form">

            <div className="lp-form-head">
              <span className="lp-kicker">Acceso al sistema</span>
              <h1 className="lp-heading">Bienvenido al POS</h1>
              <p className="lp-subtitle">Ingresa tus credenciales para iniciar el turno</p>
            </div>

            <div className="lp-fields">
              <label className="lp-field">
                <span className="lp-field-label">Usuario</span>
                <div className="lp-field-input">
                  <UserIcon />
                  <input
                    type="text"
                    placeholder="Ej. cajero"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") void handleLogin(); }}
                  />
                </div>
              </label>

              <label className="lp-field">
                <span className="lp-field-label">Contraseña</span>
                <div className="lp-field-input">
                  <LockIcon />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="• • • • • •"
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") void handleLogin(); }}
                  />
                  <button
                    type="button"
                    className="lp-eye-btn"
                    onPointerDown={e => e.preventDefault()}
                    onClick={() => setShowPassword(p => !p)}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </label>
            </div>

            <div className={`lp-error${error ? " lp-error--visible" : ""}`} role="alert" aria-live="polite">
              {error}
            </div>

            {/* Keyboard toggle — dentro del formulario, bien visible */}
            <button
              type="button"
              className={`lp-kb-toggle${showKeyboard ? " lp-kb-toggle--active" : ""}`}
              onPointerDown={e => e.preventDefault()}
              onClick={() => setShowKeyboard(p => !p)}
              aria-label={showKeyboard ? "Desactivar teclado táctil" : "Activar teclado táctil"}
            >
              {showKeyboard ? <KeyboardOnIcon /> : <KeyboardOffIcon />}
              <span>{showKeyboard ? "Teclado activo" : "Teclado táctil"}</span>
            </button>

            <Button
              variant="primary"
              size="xl"
              fullWidth
              loading={loading}
              onClick={() => void handleLogin()}
            >
              Ingresar
            </Button>

          </div>
        </div>

        {backendUrl && (
          <footer className="lp-footer">
            <span className="lp-backend-url">
              {backendUrl.replace("127.0.0.1", () => {
                try { return window.location.hostname || "127.0.0.1"; } catch { return "127.0.0.1"; }
              })}
            </span>
          </footer>
        )}
      </section>

      <LoginKeyboard open={showKeyboard} onClose={() => setShowKeyboard(false)} />
    </div>
  );
}
