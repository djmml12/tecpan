import { useEffect, useRef, useState } from "react";
import { Button, useToast } from "@pos/ui-kit";
import { apiRequest } from "../../services/api";

const PRESETS = [0, 5, 8, 10, 12, 15, 18, 20];

export default function TipsManager() {
  const { show }   = useToast();
  const mountedRef = useRef(true);

  const [tip,      setTip]      = useState(10);
  const [value,    setValue]    = useState(10);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    void apiRequest("/settings/tip").then((r: unknown) => {
      const res = r as Record<string, unknown>;
      if (res?.success) {
        const v = Number(res.value);
        if (mountedRef.current && Number.isFinite(v)) {
          setTip(v);
          setValue(v);
        }
      }
    }).catch(() => {}).finally(() => {
      if (mountedRef.current) setLoading(false);
    });
    return () => { mountedRef.current = false; };
  }, []);

  const clamp = (n: number) => Math.max(0, Math.min(100, n));

  const handleSave = async () => {
    const v = clamp(Math.round(value));
    setSaving(true);
    try {
      await apiRequest("/settings/tip", { method: "PUT", body: JSON.stringify({ value: v }) });
      if (mountedRef.current) {
        setTip(v);
        setValue(v);
        show(`Propina actualizada a ${v}%`, { type: "success" });
      }
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "Error al guardar", { type: "error" });
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const dirty = value !== tip;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div className="av-header">
        <h2 className="av-title">Propinas</h2>
      </div>

      <div className="tips-content">
        {loading ? (
          <div className="al-stub"><span>Cargando...</span></div>
        ) : (
          <div className="tips-card">

            {/* Hero + descripción */}
            <div className="tips-head">
              <div className="tips-hero" aria-live="polite">
                <span className="tips-hero-value">{value}%</span>
                <span className="tips-hero-label">Propina actual</span>
              </div>
              <div className="tips-text">
                <h3 className="tips-title">Porcentaje sugerido al cobrar</h3>
                <p className="tips-desc">
                  Aparecerá como propina recomendada en la pantalla de pago.
                  Toca un valor preestablecido o ajusta con los botones <strong>−1 / +1</strong>.
                </p>
              </div>
            </div>

            {/* Presets */}
            <div className="tips-presets" role="group" aria-label="Valores rápidos">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`tips-preset-btn${value === p ? " tips-preset-btn--active" : ""}`}
                  onClick={() => setValue(p)}
                  aria-pressed={value === p}
                >
                  {p}%
                </button>
              ))}
            </div>

            {/* Ajuste fino + Guardar */}
            <div className="tips-actions">
              <div className="tips-fine" role="group" aria-label="Ajuste fino">
                <button
                  type="button"
                  className="tips-fine-btn"
                  onClick={() => setValue(v => clamp(v - 1))}
                  disabled={value <= 0}
                  aria-label="Disminuir 1%"
                >
                  −1
                </button>
                <button
                  type="button"
                  className="tips-fine-btn"
                  onClick={() => setValue(v => clamp(v + 1))}
                  disabled={value >= 100}
                  aria-label="Aumentar 1%"
                >
                  +1
                </button>
              </div>

              <Button
                variant="primary"
                size="xl"
                fullWidth
                className="tips-save-btn"
                loading={saving}
                disabled={!dirty}
                onClick={() => void handleSave()}
              >
                {dirty ? `Guardar — ${value}%` : `Guardado: ${tip}%`}
              </Button>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
