import { useEffect, useRef, useState } from "react";
import type React from "react";

const ROWS: string[][] = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", "ñ"],
  ["z", "x", "c", "v", "b", "n", "m", "@", "."],
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function LoginKeyboard({ open, onClose }: Props) {
  const targetRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const kbRef     = useRef<HTMLDivElement>(null);

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) setPos(null);
  }, [open]);

  const dragState = useRef<{
    startPX: number; startPY: number;
    startX: number;  startY: number;
  } | null>(null);

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const kb = kbRef.current;
    if (!kb) return;
    const rect = kb.getBoundingClientRect();
    dragState.current = {
      startPX: e.clientX,
      startPY: e.clientY,
      startX:  rect.left,
      startY:  rect.top,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragState.current;
    if (!d) return;
    const kb = kbRef.current;
    if (!kb) return;
    const dx = e.clientX - d.startPX;
    const dy = e.clientY - d.startPY;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const kw = kb.offsetWidth;
    const kh = kb.offsetHeight;
    const x = Math.max(0, Math.min(vw - kw, d.startX + dx));
    const y = Math.max(0, Math.min(vh - kh, d.startY + dy));
    setPos({ x, y });
  };

  const onHeaderPointerUp = () => {
    dragState.current = null;
  };

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (
        (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) &&
        !t.readOnly && !t.disabled
      ) {
        targetRef.current = t;
      }
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  const setReactValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const proto  = el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter?.call(el, value);
  };

  const safeSetSelection = (el: HTMLInputElement | HTMLTextAreaElement, s: number, end: number) => {
    try { el.setSelectionRange(s, end); } catch { /* noop */ }
  };

  const insertText = (char: string) => {
    const el = targetRef.current;
    if (!el || el.readOnly || el.disabled) return;
    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd   ?? el.value.length;
    setReactValue(el, `${el.value.slice(0, start)}${char}${el.value.slice(end)}`);
    safeSetSelection(el, start + char.length, start + char.length);
    el.dispatchEvent(new Event("input",  { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const doBackspace = () => {
    const el = targetRef.current;
    if (!el || el.readOnly || el.disabled) return;
    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd   ?? el.value.length;
    if (start !== end) {
      setReactValue(el, `${el.value.slice(0, start)}${el.value.slice(end)}`);
      safeSetSelection(el, start, start);
    } else if (start > 0) {
      setReactValue(el, `${el.value.slice(0, start - 1)}${el.value.slice(end)}`);
      safeSetSelection(el, start - 1, start - 1);
    } else { return; }
    el.dispatchEvent(new Event("input",  { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const style: React.CSSProperties | undefined = pos
    ? { left: pos.x, top: pos.y, bottom: "unset", transform: "none", transition: "opacity 200ms" }
    : undefined;

  return (
    <div
      ref={kbRef}
      className={`lp-float-kb${open ? " lp-float-kb--open" : ""}`}
      aria-hidden={!open}
      style={style}
      onPointerDown={(e) => {
        if (!(e.target as HTMLElement).closest(".lp-float-kb-header")) {
          e.preventDefault();
        }
      }}
    >
      <div
        className="lp-float-kb-header lp-float-kb-header--drag"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
      >
        <span className="lp-float-kb-drag-handle">⠿</span>
        <span className="lp-float-kb-title">Teclado táctil</span>
        <button
          type="button"
          className="lp-float-kb-close"
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
          aria-label="Cerrar teclado"
        >
          ✕
        </button>
      </div>

      <div className="lp-float-kb-rows">
        {ROWS.map((row, ri) => (
          <div key={ri} className="lp-float-kb-row">
            {row.map((key) => (
              <button
                key={key}
                type="button"
                className="lp-float-kb-key"
                onPointerDown={(e) => { e.preventDefault(); insertText(key); }}
              >
                {key}
              </button>
            ))}
          </div>
        ))}

        <div className="lp-float-kb-row lp-float-kb-row--actions">
          <button
            type="button"
            className="lp-float-kb-key lp-float-kb-key--action lp-float-kb-key--backspace"
            onPointerDown={(e) => { e.preventDefault(); doBackspace(); }}
            aria-label="Borrar"
          >
            ⌫
          </button>
          <button
            type="button"
            className="lp-float-kb-key lp-float-kb-key--space"
            onPointerDown={(e) => { e.preventDefault(); insertText(" "); }}
            aria-label="Espacio"
          >
            espacio
          </button>
          <button
            type="button"
            className="lp-float-kb-key lp-float-kb-key--action lp-float-kb-key--enter"
            onPointerDown={(e) => {
              e.preventDefault();
              targetRef.current?.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
              );
            }}
            aria-label="Enter"
          >
            ⏎
          </button>
        </div>
      </div>
    </div>
  );
}
