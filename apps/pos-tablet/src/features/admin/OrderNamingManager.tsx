import { useEffect, useRef, useState } from "react";
import { Button, useToast } from "@pos/ui-kit";
import { apiRequest } from "../../services/api";

const DEFAULT_QUICK_NAMES = ["Mesa 1", "Mesa 2", "Mesa 3", "Mesa 4", "Mesa 5", "Mesa 6", "Mesa 7", "Mesa 8"];

interface OrderNamingConfig {
  autoName: boolean;
  quickOrdersEnabled: boolean;
  quickNames: string[];
}

export default function OrderNamingManager() {
  const { show }   = useToast();
  const mountedRef = useRef(true);

  const [config,  setConfig]  = useState<OrderNamingConfig>({
    autoName: true,
    quickOrdersEnabled: false,
    quickNames: DEFAULT_QUICK_NAMES,
  });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    void apiRequest("/settings/order-naming").then((r: unknown) => {
      const res = r as Record<string, unknown>;
      if (res?.success && res.data && typeof res.data === "object") {
        const data = res.data as Record<string, unknown>;
        if (mountedRef.current) {
          setConfig({
            autoName: data.autoName !== false,
            quickOrdersEnabled: Boolean(data.quickOrdersEnabled),
            quickNames: Array.isArray(data.quickNames) ? data.quickNames as string[] : DEFAULT_QUICK_NAMES,
          });
        }
      }
    }).catch(() => {}).finally(() => {
      if (mountedRef.current) setLoading(false);
    });
    return () => { mountedRef.current = false; };
  }, []);

  const save = async (patch: Partial<OrderNamingConfig>) => {
    const next = { ...config, ...patch };
    setSaving(true);
    try {
      await apiRequest("/settings/order-naming", {
        method: "PUT",
        body: JSON.stringify(next),
      });
      if (mountedRef.current) {
        setConfig(next);
        show("Configuración guardada", { type: "success" });
      }
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "Error al guardar", { type: "error" });
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const addName = () => {
    const name = newName.trim();
    if (!name) return;
    if (config.quickNames.includes(name)) {
      show("Ese nombre ya existe", { type: "warning" });
      return;
    }
    if (config.quickNames.length >= 30) {
      show("Máximo 30 nombres rápidos", { type: "warning" });
      return;
    }
    void save({ quickNames: [...config.quickNames, name] });
    setNewName("");
  };

  const removeName = (idx: number) => {
    const next = config.quickNames.filter((_, i) => i !== idx);
    void save({ quickNames: next.length > 0 ? next : DEFAULT_QUICK_NAMES });
  };

  const restoreDefaults = () => void save({ quickNames: DEFAULT_QUICK_NAMES });

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div className="av-header">
        <h2 className="av-title">Configuración de órdenes</h2>
      </div>

      <div className="on-content">
        {loading ? (
          <div className="al-stub"><span>Cargando...</span></div>
        ) : (
          <div className="on-grid">

            {/* ── Nombrado ── */}
            <div className="tips-card on-card">
              <div className="on-card-head">
                <div>
                  <div className="tips-title">Nombrado</div>
                  <p className="tips-desc">
                    {config.autoName
                      ? "El sistema asigna el nombre automáticamente al crear la orden."
                      : "El cajero debe introducir el nombre antes de registrar la orden."}
                  </p>
                </div>
                <div className="on-toggle-row">
                  <span className="on-toggle-side-label">{config.autoName ? "Auto" : "Manual"}</span>
                  <button
                    className={`kbd-toggle${config.autoName ? " kbd-toggle--on" : ""}`}
                    disabled={saving}
                    onClick={() => void save({ autoName: !config.autoName })}
                    aria-label="Alternar nombrado automático"
                  >
                    <span className="kbd-toggle-knob" />
                  </button>
                </div>
              </div>
            </div>

            {/* ── Órdenes rápidas ── */}
            <div className="tips-card on-card">
              <div className="on-card-head">
                <div>
                  <div className="tips-title">Órdenes rápidas</div>
                  <p className="tips-desc">
                    {config.quickOrdersEnabled
                      ? "Se muestran botones de acceso rápido al crear una orden."
                      : "Solo se muestra el campo de texto al crear una orden."}
                  </p>
                </div>
                <div className="on-toggle-row">
                  <span className="on-toggle-side-label">{config.quickOrdersEnabled ? "On" : "Off"}</span>
                  <button
                    className={`kbd-toggle${config.quickOrdersEnabled ? " kbd-toggle--on" : ""}`}
                    disabled={saving}
                    onClick={() => void save({ quickOrdersEnabled: !config.quickOrdersEnabled })}
                    aria-label="Alternar órdenes rápidas"
                  >
                    <span className="kbd-toggle-knob" />
                  </button>
                </div>
              </div>

              {/* Editor de nombres rápidos */}
              <div className="on-names-section">
                <div className="on-names-header">
                  <span className="on-names-label">Nombres rápidos</span>
                  <button className="on-restore-btn" onClick={restoreDefaults} disabled={saving}>
                    Restaurar Mesa 1–8
                  </button>
                </div>

                <div className="order-quick-tags">
                  {config.quickNames.map((name, idx) => (
                    <span key={idx} className="order-quick-tag">
                      {name}
                      <button
                        className="order-quick-tag-remove"
                        onClick={() => removeName(idx)}
                        disabled={saving}
                        aria-label={`Eliminar ${name}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>

                <div className="order-quick-editor-row">
                  <input
                    className="order-quick-input"
                    placeholder="Ej: Barra 1, Terraza…"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addName(); }}
                    maxLength={40}
                    disabled={saving}
                  />
                  <Button variant="primary" size="md" loading={saving} onClick={addName}>
                    Agregar
                  </Button>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
