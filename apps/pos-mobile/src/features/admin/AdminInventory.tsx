import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BottomSheet, Button, Input, Spinner, useToast } from "@pos/ui-kit";
import { apiRequest } from "@pos/api-client";
import { fmt, toNum } from "@pos/pos-core";
import "./admin-inventory.css";

/* ── Tipos ────────────────────────────────────────────────── */

interface AdminCategory {
  id:         number;
  name:       string;
  parent_id?: number | null;
}

interface AdminProduct {
  id:           number;
  name:         string;
  price:        number;
  cost_price:   number;
  stock:        number;
  is_active:    boolean;
  category_id?: number;
  tipo_stock:   "directo" | "receta";
}

interface ProductDraft {
  name:  string;
  price: string;
  cost:  string;
  stock: string;
}

/* ── Helpers ──────────────────────────────────────────────── */

const safeNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const asArray = (raw: unknown): unknown[] => {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
    return (raw as { data: unknown[] }).data;
  }
  return [];
};

const unwrap = (raw: unknown): Record<string, unknown> => {
  if (raw && typeof raw === "object" && "data" in raw) {
    return (raw as { data: Record<string, unknown> }).data;
  }
  return (raw ?? {}) as Record<string, unknown>;
};

const normalizeProduct = (x: unknown): AdminProduct => {
  const i = x as Record<string, unknown>;
  return {
    id:          safeNum(i.id),
    name:        String(i.name ?? ""),
    price:       safeNum(i.price),
    cost_price:  safeNum(i.cost_price),
    stock:       safeNum(i.stock),
    is_active:   Boolean(i.is_active),
    category_id: i.category_id != null ? safeNum(i.category_id) : undefined,
    tipo_stock:  i.tipo_stock === "receta" ? "receta" : "directo",
  };
};

const normalizeCategory = (x: unknown): AdminCategory => {
  const i = x as Record<string, unknown>;
  return {
    id:        safeNum(i.id),
    name:      String(i.name ?? ""),
    parent_id: i.parent_id != null ? safeNum(i.parent_id) : null,
  };
};

/* ── Iconos ───────────────────────────────────────────────── */

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/* ── Componente ───────────────────────────────────────────── */

interface Props {
  /** Notifica al shell para refrescar el catálogo del POS tras cambios. */
  onChanged?: () => void;
}

export default function AdminInventory({ onChanged }: Props) {
  const { show } = useToast();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /* Datos */
  const [categories,   setCategories]   = useState<AdminCategory[]>([]);
  const [products,     setProducts]     = useState<AdminProduct[]>([]);
  const [selectedCat,  setSelectedCat]  = useState<number | null>(null);
  const [loadingCats,  setLoadingCats]  = useState(true);
  const [loadingProds, setLoadingProds] = useState(false);

  /* Sheet de producto */
  const [showProduct,  setShowProduct]  = useState(false);
  const [prodMode,     setProdMode]     = useState<"add" | "edit">("add");
  const [editProdId,   setEditProdId]   = useState<number | null>(null);
  const [editTipoStock, setEditTipoStock] = useState<"directo" | "receta">("directo");
  const [draft,        setDraft]        = useState<ProductDraft>({ name: "", price: "", cost: "", stock: "" });
  const [savingProd,   setSavingProd]   = useState(false);
  const [confirmDelProd, setConfirmDelProd] = useState(false);

  /* Sheet de categoría */
  const [showCat,      setShowCat]      = useState(false);
  const [catMode,      setCatMode]      = useState<"add" | "edit">("add");
  const [editCatId,    setEditCatId]    = useState<number | null>(null);
  const [catName,      setCatName]      = useState("");
  const [savingCat,    setSavingCat]    = useState(false);
  const [confirmDelCat, setConfirmDelCat] = useState(false);

  const notifyChanged = useCallback(() => { onChanged?.(); }, [onChanged]);

  /* ── Carga ──────────────────────────────────────────────── */

  const loadCategories = useCallback(async () => {
    setLoadingCats(true);
    try {
      const raw = await apiRequest("/categories");
      const list = asArray(raw).map(normalizeCategory);
      if (!mountedRef.current) return;
      setCategories(list);
      setSelectedCat(prev => {
        if (prev != null && list.some(c => c.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch {
      if (mountedRef.current) show("Error cargando categorías", { type: "error" });
    } finally {
      if (mountedRef.current) setLoadingCats(false);
    }
  }, [show]);

  const loadProducts = useCallback(async (catId: number) => {
    setLoadingProds(true);
    try {
      const raw = await apiRequest(`/products?category_id=${catId}`);
      const list = asArray(raw).map(normalizeProduct);
      if (mountedRef.current) setProducts(list);
    } catch {
      if (mountedRef.current) show("Error cargando productos", { type: "error" });
    } finally {
      if (mountedRef.current) setLoadingProds(false);
    }
  }, [show]);

  useEffect(() => { void loadCategories(); }, [loadCategories]);

  useEffect(() => {
    if (selectedCat == null) { setProducts([]); return; }
    void loadProducts(selectedCat);
  }, [selectedCat, loadProducts]);

  const currentCat = useMemo(
    () => categories.find(c => c.id === selectedCat) ?? null,
    [categories, selectedCat],
  );

  /* ── Producto: abrir sheets ─────────────────────────────── */

  const openAddProduct = () => {
    if (selectedCat == null) { show("Primero seleccioná una categoría", { type: "warning" }); return; }
    setProdMode("add");
    setEditProdId(null);
    setEditTipoStock("directo");
    setDraft({ name: "", price: "", cost: "", stock: "" });
    setConfirmDelProd(false);
    setShowProduct(true);
  };

  const openEditProduct = (p: AdminProduct) => {
    setProdMode("edit");
    setEditProdId(p.id);
    setEditTipoStock(p.tipo_stock);
    setDraft({
      name:  p.name,
      price: p.price ? String(p.price) : "",
      cost:  p.cost_price ? String(p.cost_price) : "",
      stock: String(p.stock),
    });
    setConfirmDelProd(false);
    setShowProduct(true);
  };

  /* ── Producto: guardar ──────────────────────────────────── */

  const handleSaveProduct = async () => {
    const name = draft.name.trim();
    if (!name)                         { show("El nombre es requerido", { type: "warning" }); return; }
    if (selectedCat == null)           { show("Seleccioná una categoría", { type: "warning" }); return; }
    const price = safeNum(draft.price);
    if (price <= 0)                    { show("Precio inválido", { type: "warning" }); return; }

    const isReceta = prodMode === "edit" && editTipoStock === "receta";
    const body: Record<string, unknown> = {
      name,
      price,
      cost_price:  safeNum(draft.cost),
      category_id: selectedCat,
    };
    if (!isReceta) body.stock = safeNum(draft.stock);

    setSavingProd(true);
    try {
      if (prodMode === "add") {
        const created = normalizeProduct(unwrap(
          await apiRequest("/products", { method: "POST", body: JSON.stringify(body) }),
        ));
        if (mountedRef.current) setProducts(prev => [...prev, created]);
        show("Producto creado", { type: "success" });
      } else {
        const updated = normalizeProduct(unwrap(
          await apiRequest(`/products/${editProdId}`, { method: "PUT", body: JSON.stringify(body) }),
        ));
        if (mountedRef.current) setProducts(prev => prev.map(x => x.id === updated.id ? updated : x));
        show("Producto actualizado", { type: "success" });
      }
      if (mountedRef.current) setShowProduct(false);
      notifyChanged();
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "Error al guardar", { type: "error" });
    } finally {
      if (mountedRef.current) setSavingProd(false);
    }
  };

  /* ── Producto: eliminar ─────────────────────────────────── */

  const handleDeleteProduct = async () => {
    if (editProdId == null) return;
    if (!confirmDelProd) { setConfirmDelProd(true); return; }
    setSavingProd(true);
    try {
      await apiRequest(`/products/${editProdId}`, { method: "DELETE" });
      if (mountedRef.current) {
        setProducts(prev => prev.filter(x => x.id !== editProdId));
        setShowProduct(false);
        show("Producto eliminado", { type: "info" });
      }
      notifyChanged();
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "Error al eliminar", { type: "error" });
    } finally {
      if (mountedRef.current) setSavingProd(false);
    }
  };

  /* ── Categoría: abrir sheets ────────────────────────────── */

  const openAddCat = () => {
    setCatMode("add");
    setEditCatId(null);
    setCatName("");
    setConfirmDelCat(false);
    setShowCat(true);
  };

  const openEditCat = () => {
    if (!currentCat) return;
    setCatMode("edit");
    setEditCatId(currentCat.id);
    setCatName(currentCat.name);
    setConfirmDelCat(false);
    setShowCat(true);
  };

  /* ── Categoría: guardar ─────────────────────────────────── */

  const handleSaveCat = async () => {
    const name = catName.trim();
    if (!name) { show("El nombre es requerido", { type: "warning" }); return; }
    setSavingCat(true);
    try {
      if (catMode === "add") {
        const created = normalizeCategory(unwrap(
          await apiRequest("/categories", { method: "POST", body: JSON.stringify({ name }) }),
        ));
        if (mountedRef.current) {
          setCategories(prev => [...prev, created]);
          setSelectedCat(created.id);
          setShowCat(false);
        }
        show("Categoría creada", { type: "success" });
      } else {
        await apiRequest(`/categories/${editCatId}`, { method: "PUT", body: JSON.stringify({ name }) });
        if (mountedRef.current) {
          setCategories(prev => prev.map(c => c.id === editCatId ? { ...c, name } : c));
          setShowCat(false);
        }
        show("Categoría actualizada", { type: "success" });
      }
      notifyChanged();
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "Error al guardar categoría", { type: "error" });
    } finally {
      if (mountedRef.current) setSavingCat(false);
    }
  };

  /* ── Categoría: eliminar ────────────────────────────────── */

  const handleDeleteCat = async () => {
    if (editCatId == null) return;
    if (!confirmDelCat) { setConfirmDelCat(true); return; }
    setSavingCat(true);
    try {
      await apiRequest(`/categories/${editCatId}`, { method: "DELETE" });
      if (mountedRef.current) {
        const remaining = categories.filter(c => c.id !== editCatId && c.parent_id !== editCatId);
        setCategories(remaining);
        setSelectedCat(remaining[0]?.id ?? null);
        setShowCat(false);
        show("Categoría eliminada", { type: "info" });
      }
      notifyChanged();
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "Error al eliminar categoría", { type: "error" });
    } finally {
      if (mountedRef.current) setSavingCat(false);
    }
  };

  /* ── Render ─────────────────────────────────────────────── */

  return (
    <div className="ai-root">
      <header className="ai-header">
        <h1 className="ai-title">Inventario</h1>
        <p className="ai-sub">Categorías, precios y stock</p>
      </header>

      {/* Chips de categoría */}
      <div className="ai-cats" role="toolbar" aria-label="Categorías">
        {loadingCats ? (
          <span className="ai-cats-loading">Cargando…</span>
        ) : (
          <>
            {categories.map(cat => (
              <button
                key={cat.id}
                className={`ai-chip${selectedCat === cat.id ? " ai-chip--active" : ""}`}
                onClick={() => setSelectedCat(cat.id)}
              >
                {cat.name}
              </button>
            ))}
            <button className="ai-chip ai-chip--add" onClick={openAddCat} aria-label="Nueva categoría">
              <PlusIcon />
            </button>
          </>
        )}
      </div>

      {/* Barra de la categoría seleccionada */}
      {currentCat && (
        <div className="ai-catbar">
          <button className="ai-catbar-edit" onClick={openEditCat}>
            <PencilIcon />
            <span>{currentCat.name}</span>
          </button>
          <button className="ai-add-prod" onClick={openAddProduct}>
            <PlusIcon />
            <span>Producto</span>
          </button>
        </div>
      )}

      {/* Lista de productos */}
      <div className="ai-list">
        {loadingProds ? (
          <div className="ai-center"><Spinner size="md" /></div>
        ) : selectedCat == null ? (
          <div className="ai-center"><p className="ai-empty">Creá o seleccioná una categoría</p></div>
        ) : products.length === 0 ? (
          <div className="ai-center"><p className="ai-empty">Sin productos en esta categoría</p></div>
        ) : (
          products.map(p => (
            <button key={p.id} className="ai-prod" onClick={() => openEditProduct(p)}>
              <div className="ai-prod-main">
                <span className="ai-prod-name">{p.name}</span>
                <span className="ai-prod-meta">
                  <span className="ai-prod-price">{fmt(toNum(p.price))}</span>
                  <span className={`ai-prod-stock${p.tipo_stock === "receta" ? " ai-prod-stock--receta" : ""}`}>
                    {p.tipo_stock === "receta" ? "receta" : `${p.stock} u`}
                  </span>
                </span>
              </div>
              <ChevronIcon />
            </button>
          ))
        )}
      </div>

      {/* ── Sheet: producto ── */}
      <BottomSheet
        open={showProduct}
        onClose={() => setShowProduct(false)}
        title={prodMode === "add" ? "Nuevo producto" : "Editar producto"}
        height="auto"
      >
        <div className="ai-form">
          <Input
            label="Nombre"
            type="text"
            value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          />
          <Input
            label="Precio de venta (Q)"
            type="text"
            inputMode="decimal"
            value={draft.price}
            onChange={e => setDraft(d => ({ ...d, price: e.target.value.replace(/[^0-9.]/g, "") }))}
          />
          <Input
            label="Costo (Q) · opcional"
            type="text"
            inputMode="decimal"
            value={draft.cost}
            onChange={e => setDraft(d => ({ ...d, cost: e.target.value.replace(/[^0-9.]/g, "") }))}
          />
          {editTipoStock === "receta" ? (
            <p className="ai-note">
              Este producto descuenta insumos (receta). El stock se calcula automáticamente desde la bodega.
            </p>
          ) : (
            <Input
              label="Stock (unidades)"
              type="text"
              inputMode="numeric"
              value={draft.stock}
              onChange={e => setDraft(d => ({ ...d, stock: e.target.value.replace(/[^0-9-]/g, "") }))}
            />
          )}

          <Button variant="primary" size="lg" fullWidth loading={savingProd} onClick={() => void handleSaveProduct()}>
            {prodMode === "add" ? "Crear producto" : "Guardar cambios"}
          </Button>

          {prodMode === "edit" && (
            <button
              className={`ai-delete${confirmDelProd ? " ai-delete--confirm" : ""}`}
              disabled={savingProd}
              onClick={() => void handleDeleteProduct()}
            >
              {confirmDelProd ? "Tocá de nuevo para confirmar" : "Eliminar producto"}
            </button>
          )}
        </div>
      </BottomSheet>

      {/* ── Sheet: categoría ── */}
      <BottomSheet
        open={showCat}
        onClose={() => setShowCat(false)}
        title={catMode === "add" ? "Nueva categoría" : "Editar categoría"}
        height="auto"
      >
        <div className="ai-form">
          <Input
            label="Nombre de la categoría"
            type="text"
            value={catName}
            onChange={e => setCatName(e.target.value)}
          />

          <Button variant="primary" size="lg" fullWidth loading={savingCat} onClick={() => void handleSaveCat()}>
            {catMode === "add" ? "Crear categoría" : "Guardar cambios"}
          </Button>

          {catMode === "edit" && (
            <button
              className={`ai-delete${confirmDelCat ? " ai-delete--confirm" : ""}`}
              disabled={savingCat}
              onClick={() => void handleDeleteCat()}
            >
              {confirmDelCat ? "Tocá de nuevo para confirmar" : "Eliminar categoría"}
            </button>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
