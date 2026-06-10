import { useCallback, useEffect, useRef, useState } from "react";

export interface TweakValues {
  typo: "rustica" | "limpia";
  density: "compacta" | "comoda";
  dark: boolean;
}

const STORAGE_KEY = "tecpan-tweaks";

export function useTweaks(defaults: TweakValues): [TweakValues, <K extends keyof TweakValues>(key: K, val: TweakValues[K]) => void] {
  const [values, setValues] = useState<TweakValues>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? { ...defaults, ...JSON.parse(stored) } : defaults;
    } catch {
      return defaults;
    }
  });

  const setTweak = useCallback(<K extends keyof TweakValues>(key: K, val: TweakValues[K]) => {
    setValues(prev => {
      const next = { ...prev, [key]: val };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return [values, setTweak];
}

const PANEL_STYLE = `
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:260px;
    max-height:calc(100vh - 32px);display:flex;flex-direction:column;
    background:rgba(250,249,247,.88);color:#29261b;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:.5px solid rgba(255,255,255,.6);border-radius:14px;
    box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.18);
    font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:10px 8px 10px 14px;cursor:move;user-select:none;border-bottom:.5px solid rgba(0,0,0,.08)}
  .twk-hd b{font-size:12px;font-weight:600;letter-spacing:.01em}
  .twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
    width:22px;height:22px;border-radius:6px;cursor:pointer;font-size:13px;line-height:22px;text-align:center}
  .twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
  .twk-body{padding:10px 14px 14px;display:flex;flex-direction:column;gap:10px;
    overflow-y:auto;overflow-x:hidden;min-height:0;
    scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}
  .twk-body::-webkit-scrollbar{width:6px}
  .twk-body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:4px}
  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
    color:rgba(41,38,27,.45);padding:6px 0 0}
  .twk-sect:first-child{padding-top:0}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .twk-lbl{font-size:11px;font-weight:500;color:rgba(41,38,27,.65)}
  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;
    background:rgba(0,0,0,.06);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;
    background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.12);
    transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:inherit;font:inherit;font-weight:500;min-height:22px;
    border-radius:6px;cursor:pointer;padding:4px 6px;line-height:1.2}
  .twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:999px;
    background:rgba(0,0,0,.15);transition:background .15s;cursor:pointer;padding:0;flex-shrink:0}
  .twk-toggle[data-on="1"]{background:#E8A813}
  .twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
    background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s;display:block}
  .twk-toggle[data-on="1"] i{transform:translateX(14px)}
  .twk-tab{position:fixed;right:0;bottom:80px;z-index:2147483645;
    writing-mode:vertical-rl;text-orientation:mixed;
    padding:10px 6px;background:rgba(250,249,247,.88);
    -webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);
    border:.5px solid rgba(255,255,255,.6);border-radius:8px 0 0 8px;
    font:600 10px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.08em;
    text-transform:uppercase;color:rgba(41,38,27,.6);cursor:pointer;
    box-shadow:-4px 0 12px rgba(0,0,0,.12);user-select:none}
  .twk-tab:hover{color:#29261b}
`;

interface SegmentProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}

function Segment({ label, value, options, onChange }: SegmentProps) {
  const n = options.length;
  const idx = Math.max(0, options.findIndex(o => o.value === value));
  return (
    <div className="twk-row">
      <div className="twk-lbl">{label}</div>
      <div className="twk-seg" role="radiogroup">
        <div className="twk-seg-thumb"
             style={{ left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
                      width: `calc((100% - 4px) / ${n})` }} />
        {options.map(o => (
          <button key={o.value} type="button" role="radio"
                  aria-checked={o.value === value}
                  onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface TweaksPanelProps {
  values: TweakValues;
  onTypo: (v: TweakValues["typo"]) => void;
  onDensity: (v: TweakValues["density"]) => void;
  onDark: (v: boolean) => void;
}

export default function TweaksPanel({ values, onTypo, onDensity, onDark }: TweaksPanelProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef({ x: 16, y: 16 });
  const PAD = 16;

  const clamp = useCallback(() => {
    const el = panelRef.current;
    if (!el) return;
    const maxX = Math.max(PAD, window.innerWidth - el.offsetWidth - PAD);
    const maxY = Math.max(PAD, window.innerHeight - el.offsetHeight - PAD);
    offsetRef.current = {
      x: Math.min(maxX, Math.max(PAD, offsetRef.current.x)),
      y: Math.min(maxY, Math.max(PAD, offsetRef.current.y)),
    };
    el.style.right  = offsetRef.current.x + "px";
    el.style.bottom = offsetRef.current.y + "px";
  }, []);

  useEffect(() => {
    if (!open) return;
    clamp();
    const ro = new ResizeObserver(clamp);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [open, clamp]);

  const onDragStart = (e: React.MouseEvent) => {
    const el = panelRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const sr = window.innerWidth - r.right;
    const sb = window.innerHeight - r.bottom;
    const move = (ev: MouseEvent) => {
      offsetRef.current = { x: sr - (ev.clientX - sx), y: sb - (ev.clientY - sy) };
      clamp();
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <>
      <style>{PANEL_STYLE}</style>
      <button className="twk-tab" onClick={() => setOpen(v => !v)} aria-label="Tweaks panel">
        TWEAKS
      </button>
      {open && (
        <div ref={panelRef} className="twk-panel"
             style={{ right: offsetRef.current.x, bottom: offsetRef.current.y }}>
          <div className="twk-hd" onMouseDown={onDragStart}>
            <b>Tweaks · Tecpancito</b>
            <button className="twk-x" onClick={() => setOpen(false)}
                    onMouseDown={e => e.stopPropagation()}>✕</button>
          </div>
          <div className="twk-body">
            <div className="twk-sect">Tipografía</div>
            <Segment label="Estilo" value={values.typo}
              options={[{ value: "rustica", label: "Rústica" }, { value: "limpia", label: "Limpia" }]}
              onChange={v => onTypo(v as TweakValues["typo"])} />

            <div className="twk-sect">Densidad</div>
            <Segment label="Compactado" value={values.density}
              options={[{ value: "compacta", label: "Compacta" }, { value: "comoda", label: "Cómoda" }]}
              onChange={v => onDensity(v as TweakValues["density"])} />

            <div className="twk-sect">Tema</div>
            <div className="twk-row twk-row-h">
              <div className="twk-lbl">Modo oscuro</div>
              <button type="button" className="twk-toggle" data-on={values.dark ? "1" : "0"}
                      role="switch" aria-checked={values.dark}
                      onClick={() => onDark(!values.dark)}><i /></button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
