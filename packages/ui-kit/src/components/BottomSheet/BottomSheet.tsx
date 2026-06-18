import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./BottomSheet.css";

export type BottomSheetHeight = "auto" | "half" | "tall" | "full";

export interface BottomSheetProps {
  open:               boolean;
  onClose:            () => void;
  title?:             string;
  children:           ReactNode;
  height?:            BottomSheetHeight;
  /** Constrain sheet width and center horizontally */
  maxWidth?:          number | string;
  /** Center the sheet both vertically and horizontally (modal style) */
  centered?:          boolean;
  /** Hide the close (×) button in the header */
  hideClose?:         boolean;
  /** Tap backdrop to close. Default: true */
  closeOnBackdrop?:   boolean;
  /** Allow drag-down to close. Default: true */
  draggable?:         boolean;
}

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  height          = "auto",
  maxWidth,
  centered        = false,
  hideClose       = false,
  closeOnBackdrop = true,
  draggable       = true,
}: BottomSheetProps) {
  const sheetRef    = useRef<HTMLDivElement>(null);
  const startYRef   = useRef<number | null>(null);
  const currentYRef = useRef<number>(0);

  /* ── Scroll lock ──────────────────────── */
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  /* ── Scroll focused input into view when keyboard opens ── */
  useEffect(() => {
    if (!open) return;
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement && sheetRef.current?.contains(t)) {
        setTimeout(() => t.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
      }
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [open]);

  /* ── Drag to dismiss ──────────────────── */
  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggable || centered) return;
    startYRef.current = e.clientY;
    currentYRef.current = 0;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggable || centered || startYRef.current === null) return;
    const delta = e.clientY - startYRef.current;
    if (delta <= 0) return;
    currentYRef.current = delta;
    if (sheetRef.current) {
      sheetRef.current.style.transition = "none";
      sheetRef.current.style.transform  = `translateY(${delta}px)`;
    }
  };

  const onDragEnd = () => {
    if (!draggable || centered) return;
    startYRef.current = null;
    if (currentYRef.current > 110) {
      onClose();
    } else {
      if (sheetRef.current) {
        sheetRef.current.style.transition = "";
        sheetRef.current.style.transform  = "";
      }
    }
    currentYRef.current = 0;
  };

  if (!open) return null;

  const sheetStyle: React.CSSProperties = {};
  if (maxWidth) sheetStyle.maxWidth = typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth;
  if (maxWidth || centered) sheetStyle.marginInline = "auto";
  if (centered) sheetStyle.borderRadius = "var(--radius-2xl)";

  return createPortal(
    <div
      className={`uk-bs-backdrop${centered ? " uk-bs-backdrop--centered" : ""}`}
      onClick={closeOnBackdrop ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={sheetRef}
        className={`uk-bs uk-bs--${height}${centered ? " uk-bs--centered" : ""}`}
        onClick={(e) => e.stopPropagation()}
        style={Object.keys(sheetStyle).length ? sheetStyle : undefined}
      >
        {!centered && (
          <div
            className="uk-bs-handle-area"
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
          >
            <div className="uk-bs-handle" />
          </div>
        )}

        {title && (
          <div className="uk-bs-header">
            <span className="uk-bs-title">{title}</span>
            {!hideClose && (
              <button
                className="uk-bs-close"
                onClick={onClose}
                aria-label="Cerrar"
                type="button"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        )}

        <div className="uk-bs-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
