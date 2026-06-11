import { useEffect, useState } from "react";
import { Button, useToast } from "@pos/ui-kit";
import { useDisplayScale } from "../../hooks/useDisplayScale";
import {
  setScale,
  SCALE_MIN,
  SCALE_MAX,
  SCALE_STEP,
} from "../../services/displayScale";

const PRESETS = [
  { v: 0.7,  label: "70%" },
  { v: 0.8,  label: "80%" },
  { v: 0.85, label: "85%" },
  { v: 0.9,  label: "90%" },
  { v: 1.0,  label: "100%" },
  { v: 1.1,  label: "110%" },
  { v: 1.25, label: "125%" },
  { v: 1.4,  label: "140%" },
];

const pct = (v: number) => `${Math.round(v * 100)}%`;
const eq = (a: number, b: number) => Math.abs(a - b) < 0.001;

interface ScreenInfo {
  screenW: number;
  screenH: number;
  viewW: number;
  viewH: number;
  dpr: number;
}

const readScreen = (): ScreenInfo => ({
  screenW: window.screen?.width ?? 0,
  screenH: window.screen?.height ?? 0,
  viewW: window.innerWidth,
  viewH: window.innerHeight,
  dpr: window.devicePixelRatio || 1,
});

export default function DisplayManager() {
  const { show } = useToast();
  const scale = useDisplayScale(); // fuente de verdad: se aplica al instante

  const [info, setInfo] = useState<ScreenInfo>(readScreen);

  useEffect(() => {
    const onResize = () => setInfo(readScreen());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleReset = () => {
    setScale(1);
    show("Escala restablecida a 100%", { type: "success" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div className="av-header">
        <h2 className="av-title">Pantalla y escala</h2>
      </div>

      <div className="tips-content">
        <div className="tips-card">

          {/* Hero + descripción */}
          <div className="tips-head">
            <div className="tips-hero" aria-live="polite">
              <span className="tips-hero-value">{pct(scale)}</span>
              <span className="tips-hero-label">Escala de la interfaz</span>
            </div>
            <div className="tips-text">
              <h3 className="tips-title">Tamaño de render del POS</h3>
              <p className="tips-desc">
                Ajusta qué tan grande se ve todo en esta tablet. Bájalo si la
                interfaz se ve demasiado grande o borrosa; súbelo si los botones
                quedan pequeños. El cambio se aplica al instante y se guarda
                <strong> solo en este dispositivo</strong>.
              </p>
            </div>
          </div>

          {/* Slider continuo */}
          <div className="dm-slider-row">
            <button
              type="button"
              className="tips-fine-btn"
              onClick={() => setScale(scale - SCALE_STEP)}
              disabled={scale <= SCALE_MIN}
              aria-label="Reducir escala"
            >
              −
            </button>
            <input
              type="range"
              className="dm-range"
              min={SCALE_MIN}
              max={SCALE_MAX}
              step={SCALE_STEP}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              aria-label="Escala de la interfaz"
            />
            <button
              type="button"
              className="tips-fine-btn"
              onClick={() => setScale(scale + SCALE_STEP)}
              disabled={scale >= SCALE_MAX}
              aria-label="Aumentar escala"
            >
              +
            </button>
          </div>

          {/* Presets */}
          <div className="tips-presets" role="group" aria-label="Escalas rápidas">
            {PRESETS.map((p) => (
              <button
                key={p.v}
                type="button"
                className={`tips-preset-btn${eq(scale, p.v) ? " tips-preset-btn--active" : ""}`}
                onClick={() => setScale(p.v)}
                aria-pressed={eq(scale, p.v)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Diagnóstico de pantalla */}
          <div className="dm-diag">
            <div className="dm-diag-item">
              <span className="dm-diag-label">Resolución física</span>
              <span className="dm-diag-value">{info.screenW} × {info.screenH}</span>
            </div>
            <div className="dm-diag-item">
              <span className="dm-diag-label">Área visible (CSS px)</span>
              <span className="dm-diag-value">{info.viewW} × {info.viewH}</span>
            </div>
            <div className="dm-diag-item">
              <span className="dm-diag-label">Densidad (DPR)</span>
              <span className="dm-diag-value">{info.dpr.toFixed(2)}×</span>
            </div>
            <div className="dm-diag-item">
              <span className="dm-diag-label">Escala efectiva</span>
              <span className="dm-diag-value">{pct(scale)}</span>
            </div>
          </div>

          {/* Acciones */}
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            onClick={handleReset}
            disabled={eq(scale, 1)}
          >
            Restablecer a 100%
          </Button>

        </div>
      </div>
    </div>
  );
}
