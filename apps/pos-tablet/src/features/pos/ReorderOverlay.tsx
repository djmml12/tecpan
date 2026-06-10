import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@pos/ui-kit";
import { apiRequest } from "../../services/api";

/* ── Types ────────────────────────────────────────────────── */

interface Category { id: number; name: string; parent_id: number | null; }
interface Product  { id: number; name: string; price: number; category_id?: number; }

/* ── Drag-and-drop list ───────────────────────────────────── */

function DragList<T extends { id: number }>({
  items,
  renderLabel,
  onReorder,
}: {
  items: T[];
  renderLabel: (item: T) => string;
  onReorder: (items: T[]) => void;
}) {
  const [list, setList]     = useState<T[]>(items);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const rowsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => { setList(items); }, [items]);

  /* find row index under a Y coordinate */
  const idxAtY = (clientY: number): number | null => {
    for (let i = 0; i < rowsRef.current.length; i++) {
      const el = rowsRef.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) return i;
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>, idx: number) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragIdx(idx);
    setOverIdx(idx);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragIdx === null) return;
    const idx = idxAtY(e.clientY);
    if (idx !== null) setOverIdx(idx);
  };

  const onPointerUp = () => {
    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
      const next = [...list];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(overIdx, 0, moved);
      setList(next);
      onReorder(next);
    }
    setDragIdx(null);
    setOverIdx(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {list.map((item, idx) => {
        const isDragging = dragIdx === idx;
        const isOver     = overIdx === idx && dragIdx !== null && dragIdx !== idx;
        return (
          <div
            key={item.id}
            ref={el => { rowsRef.current[idx] = el; }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "11px 14px",
              background: isDragging ? "var(--accent-soft)" : "var(--bg-elev)",
              border: `1px solid ${isOver ? "var(--accent)" : isDragging ? "var(--accent-deep)" : "var(--border-strong)"}`,
              borderRadius: "var(--radius-md)",
              opacity: isDragging ? 0.7 : 1,
              transition: "background 120ms, border-color 120ms, opacity 120ms",
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
          >
            {/* handle */}
            <div
              onPointerDown={e => onPointerDown(e, idx)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{
                cursor: "grab",
                color: "var(--text-3)",
                display: "flex",
                alignItems: "center",
                padding: "4px 2px",
                touchAction: "none",
                flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="4" y1="7"  x2="20" y2="7"  />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </svg>
            </div>

            <span style={{
              flex: 1,
              fontSize: 15,
              fontWeight: 600,
              color: "var(--text-1)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {renderLabel(item)}
            </span>

            <span style={{
              fontSize: 12,
              color: "var(--text-3)",
              fontWeight: 700,
              background: "var(--bg-deeper)",
              borderRadius: 999,
              padding: "2px 8px",
              flexShrink: 0,
            }}>
              #{idx + 1}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Main overlay ─────────────────────────────────────────── */

interface Props { onClose: () => void; }

export default function ReorderOverlay({ onClose }: Props) {
  const { show } = useToast();

  const [tab, setTab]             = useState<"cats" | "prods">("cats");
  const [categories, setCategories] = useState<Category[]>([]);
  const [products,   setProducts]   = useState<Product[]>([]);
  const [selCat,     setSelCat]     = useState<number | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);

  const pendingCats  = useRef<Category[]>([]);
  const pendingProds = useRef<Product[]>([]);
  const mountedRef   = useRef(true);

  /* load */
  useEffect(() => {
    mountedRef.current = true;
    void (async () => {
      try {
        const raw = await apiRequest("/categories?includeInactive=true") as Category[];
        const cats = raw.filter((c: Category) => c.parent_id === null);
        if (!mountedRef.current) return;
        setCategories(cats);
        pendingCats.current = cats;
        if (cats[0]) {
          setSelCat(cats[0].id);
          await loadProds(cats[0].id);
        }
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
    return () => { mountedRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProds = useCallback(async (catId: number) => {
    setLoading(true);
    try {
      const raw = await apiRequest(`/products?category_id=${catId}&includeInactive=true`) as Product[];
      if (mountedRef.current) {
        setProducts(raw);
        pendingProds.current = raw;
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const selectCat = (id: number) => {
    setSelCat(id);
    void loadProds(id);
  };

  /* save */
  const save = async () => {
    setSaving(true);
    try {
      await apiRequest("/categories/reorder", {
        method: "PATCH",
        body: JSON.stringify(pendingCats.current.map((c, i) => ({ id: c.id, order: i }))),
      });
      if (selCat !== null) {
        await apiRequest("/products/reorder", {
          method: "PATCH",
          body: JSON.stringify(pendingProds.current.map((p, i) => ({ id: p.id, order: i }))),
        });
      }
      show("Orden guardado", { type: "success" });
      onClose();
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "Error al guardar", { type: "error" });
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ", minimumFractionDigits: 2 }).format(n);

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      flex: 1, overflow: "hidden",
      background: "var(--bg)",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "14px 20px",
        borderBottom: "1px solid var(--border-strong)",
        background: "var(--bg-elev)",
        flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          style={{
            width: 40, height: 40, borderRadius: "50%",
            border: "1px solid var(--border-strong)",
            background: "var(--bg-deeper)", color: "var(--text-2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", flexShrink: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 style={{ flex: 1, margin: 0, fontSize: 20, fontWeight: 900, color: "var(--text-1)" }}>
          Ordenar
        </h1>
        <button
          onClick={() => void save()}
          disabled={saving}
          style={{
            height: 40, padding: "0 20px", borderRadius: "var(--radius-md)",
            border: "1px solid var(--accent-deep)",
            background: "linear-gradient(160deg, #F5C944, var(--accent) 55%, var(--accent-deep))",
            color: "var(--accent-ink, #2B1608)",
            fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Guardando…" : "Guardar orden"}
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", gap: 0,
        borderBottom: "1px solid var(--border-strong)",
        background: "var(--bg-elev)", flexShrink: 0,
      }}>
        {(["cats", "prods"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, height: 48,
              border: "none", borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
              background: "transparent",
              color: tab === t ? "var(--accent-deep)" : "var(--text-3)",
              fontWeight: 700, fontSize: 14,
              cursor: "pointer", transition: "all 140ms",
            }}
          >
            {t === "cats" ? "Categorías" : "Productos"}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex" }}>

        {/* Category selector (products tab) */}
        {tab === "prods" && (
          <div style={{
            width: 180, flexShrink: 0,
            borderRight: "1px solid var(--border-strong)",
            overflowY: "auto",
            background: "var(--bg-elev)",
          }}>
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => selectCat(c.id)}
                style={{
                  width: "100%", padding: "12px 16px", textAlign: "left",
                  border: "none", borderBottom: "1px solid var(--border-strong)",
                  background: selCat === c.id ? "var(--accent-soft)" : "transparent",
                  color: selCat === c.id ? "var(--accent-deep)" : "var(--text-2)",
                  fontWeight: selCat === c.id ? 700 : 600,
                  fontSize: 13, cursor: "pointer",
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* List */}
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "16px 20px" }}>
          {loading ? (
            <div style={{ textAlign: "center", color: "var(--text-3)", padding: 40, fontWeight: 600 }}>
              Cargando…
            </div>
          ) : tab === "cats" ? (
            <DragList
              items={categories}
              renderLabel={c => c.name}
              onReorder={next => { setCategories(next); pendingCats.current = next; }}
            />
          ) : products.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--text-3)", padding: 40, fontWeight: 600 }}>
              Sin productos en esta categoría
            </div>
          ) : (
            <DragList
              items={products}
              renderLabel={p => `${p.name}  ${fmt(p.price)}`}
              onReorder={next => { setProducts(next); pendingProds.current = next; }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
