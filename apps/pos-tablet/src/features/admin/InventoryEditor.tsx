import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@pos/ui-kit";
import { apiRequest } from "../../services/api";
import "./inventory-editor.css";

interface Category { id: number; name: string; is_active: boolean; parent_id: number | null; }
interface Product {
  id: number; name: string; price: number; cost_price: number; stock: number;
  is_active: boolean; category_id?: number; tipo_stock?: "directo" | "receta";
}

interface Props {
  categories: Category[];
  initialCatId?: number | null;
  lowThreshold?: number;
  critThreshold?: number;
  role?: string;
  onClose?: () => void;
  onCategoriesChanged: (next: Category[]) => void;
  onProductsChanged?: () => void;
}

type Field = "catName" | "name" | "price" | "cost" | "stock";
const KEY_ROWS: string[][] = [
  ["1","2","3","4","5","6","7","8","9","0"],
  ["q","w","e","r","t","y","u","i","o","p"],
  ["a","s","d","f","g","h","j","k","l","ñ"],
  ["z","x","c","v","b","n","m","@","."],
];
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const fmtQ = (n: number) => "Q" + (num(n)).toFixed(2);
const unwrap = <T,>(p: unknown): T => (p && typeof p === "object" && "data" in p) ? (p as { data: T }).data : p as T;
const normProd = (x: unknown): Product => {
  const i = x as Record<string, unknown>;
  return {
    id: num(i.id), name: String(i.name ?? ""), price: num(i.price), cost_price: num(i.cost_price),
    stock: num(i.stock), is_active: Boolean(i.is_active),
    category_id: i.category_id != null ? num(i.category_id) : undefined,
    tipo_stock: i.tipo_stock === "receta" ? "receta" : "directo",
  };
};

export default function InventoryEditor({
  categories, initialCatId = null, lowThreshold = 15, critThreshold = 5,
  role = "admin", onClose, onCategoriesChanged, onProductsChanged,
}: Props) {
  const { show } = useToast();
  const mounted = useRef(true);
  const canEdit = role === "admin";

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const [cats, setCats] = useState<Category[]>(categories);
  useEffect(() => { setCats(categories); }, [categories]);

  const firstCat = initialCatId ?? categories[0]?.id ?? null;
  const [selCatId, setSelCatId]     = useState<number | null>(firstCat);
  const [products, setProducts]     = useState<Product[]>([]);
  const [mode, setMode]             = useState<"category" | "product">("category");
  const [editCatId, setEditCatId]   = useState<number | null>(firstCat);
  const [selProdId, setSelProdId]   = useState<number | null>(null);
  const [catDraft, setCatDraft]     = useState<string>(categories.find(c => c.id === firstCat)?.name ?? "");
  const [pDraft, setPDraft]         = useState({ name: "", price: "", cost: "", stock: "" });
  const [active, setActive]         = useState<Field>("catName");
  const [recetaLock, setRecetaLock] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy]             = useState(false);
  const [search, setSearch]         = useState("");

  const loadProducts = useCallback(async (catId: number) => {
    try {
      const raw = await apiRequest(`/products?category_id=${catId}&includeInactive=true`);
      const data = (unwrap<unknown[]>(raw) as unknown[]).map(normProd).filter(p => p.is_active);
      if (mounted.current) setProducts(data);
    } catch { if (mounted.current) show("Error cargando productos", { type: "error" }); }
  }, [show]);

  useEffect(() => { if (selCatId != null) void loadProducts(selCatId); }, [selCatId, loadProducts]);

  const selCat = useMemo(() => cats.find(c => c.id === selCatId) ?? null, [cats, selCatId]);

  const selectCategory = (c: Category) => {
    setMode("category"); setSelCatId(c.id); setEditCatId(c.id); setSelProdId(null);
    setCatDraft(c.name); setActive("catName"); setConfirmDel(false);
  };
  const newCategory = () => {
    setMode("category"); setEditCatId(null); setSelProdId(null);
    setCatDraft(""); setActive("catName"); setConfirmDel(false);
  };
  const selectProduct = (p: Product) => {
    setMode("product"); setSelProdId(p.id);
    setRecetaLock(p.tipo_stock === "receta");
    setPDraft({ name: p.name, price: String(p.price), cost: String(p.cost_price), stock: String(p.stock) });
    setActive("name"); setConfirmDel(false);
  };
  const newProduct = () => {
    if (selCatId == null) { show("Selecciona una categoría", { type: "warning" }); return; }
    setMode("product"); setSelProdId(null); setRecetaLock(false);
    setPDraft({ name: "", price: "", cost: "", stock: "" }); setActive("name"); setConfirmDel(false);
  };

  const onKeyTap = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-key],[data-action]");
    if (!el) return;
    const key = el.getAttribute("data-key");
    const action = el.getAttribute("data-action");
    if (action === "enter") { void confirm(); return; }
    setConfirmDel(false);
    const f = active;
    const numeric = f === "price" || f === "cost" || f === "stock";
    const noDot = f === "stock";
    const apply = (v: string) => {
      if (action === "backspace") return v.slice(0, -1);
      if (action === "space") return numeric ? v : v + " ";
      if (key == null) return v;
      if (numeric) { if (!/[0-9.]/.test(key)) return v; if (key === "." && (noDot || v.includes("."))) return v; }
      return v + key;
    };
    if (f === "catName") setCatDraft(v => apply(v));
    else setPDraft(d => ({ ...d, [f]: apply(d[f as "name" | "price" | "cost" | "stock"]) }));
  };

  const confirm = async () => {
    if (busy) return;
    if (mode === "category") {
      const name = catDraft.trim();
      if (!name) { show("Escribe un nombre", { type: "warning" }); return; }
      if (cats.some(c => c.name.toLowerCase() === name.toLowerCase() && c.id !== editCatId)) {
        show("Ya existe esa categoría", { type: "warning" }); return;
      }
      setBusy(true);
      try {
        if (editCatId) {
          await apiRequest(`/categories/${editCatId}`, { method: "PUT", body: JSON.stringify({ name }) });
          const next = cats.map(c => c.id === editCatId ? { ...c, name } : c);
          setCats(next); onCategoriesChanged(next); show("Categoría actualizada", { type: "success" });
        } else {
          const nm = name.charAt(0).toUpperCase() + name.slice(1);
          const created = await apiRequest("/categories", { method: "POST", body: JSON.stringify({ name: nm }) });
          const obj = (unwrap<Record<string, unknown>>(created)) as Record<string, unknown>;
          const nc: Category = { id: num(obj.id), name: String(obj.name), is_active: true, parent_id: null };
          const next = [...cats, nc];
          setCats(next); onCategoriesChanged(next);
          setSelCatId(nc.id); setEditCatId(nc.id); setCatDraft(nc.name);
          show("Categoría creada", { type: "success" });
        }
      } catch (err) { show(err instanceof Error ? err.message : "Error al guardar", { type: "error" }); }
      finally { if (mounted.current) setBusy(false); }
    } else {
      const name = pDraft.name.trim();
      if (!name) { show("Escribe el nombre del producto", { type: "warning" }); return; }
      const price = parseFloat(pDraft.price);
      if (!(price > 0)) { show("Precio de venta requerido", { type: "warning" }); return; }
      if (selCatId == null) return;
      const body: Record<string, unknown> = {
        name, price: num(price), cost_price: num(parseFloat(pDraft.cost) || 0), category_id: selCatId,
      };
      if (!recetaLock) body.stock = num(parseInt(pDraft.stock, 10) || 0);
      setBusy(true);
      try {
        if (selProdId) {
          const upd = await apiRequest(`/products/${selProdId}`, { method: "PUT", body: JSON.stringify(body) });
          const p = normProd(unwrap(upd));
          setProducts(prev => prev.map(x => x.id === p.id ? p : x));
          show("Producto actualizado", { type: "success" });
        } else {
          const cr = await apiRequest("/products", { method: "POST", body: JSON.stringify(body) });
          const p = normProd(unwrap(cr));
          setProducts(prev => [...prev, p]); setSelProdId(p.id);
          setPDraft({ name: p.name, price: String(p.price), cost: String(p.cost_price), stock: String(p.stock) });
          show("Producto creado", { type: "success" });
        }
        onProductsChanged?.();
      } catch (err) { show(err instanceof Error ? err.message : "Error al guardar", { type: "error" }); }
      finally { if (mounted.current) setBusy(false); }
    }
  };

  const deleteCurrent = async () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    setBusy(true);
    try {
      if (mode === "category") {
        if (!editCatId) return;
        await apiRequest(`/categories/${editCatId}`, { method: "DELETE" });
        const cat = cats.find(c => c.id === editCatId);
        const rest = cats.filter(c => c.id !== editCatId && c.parent_id !== editCatId);
        setCats(rest); onCategoriesChanged(rest);
        const nextSel = rest[0] ?? null;
        setSelCatId(nextSel?.id ?? null); setEditCatId(nextSel?.id ?? null);
        setCatDraft(nextSel?.name ?? ""); setSelProdId(null); setMode("category"); setActive("catName");
        show(`"${cat?.name ?? ""}" eliminada`, { type: "info" });
      } else {
        if (!selProdId) return;
        const p = products.find(x => x.id === selProdId);
        await apiRequest(`/products/${selProdId}`, { method: "DELETE" });
        setProducts(prev => prev.filter(x => x.id !== selProdId));
        setSelProdId(null); setMode("category"); setEditCatId(selCatId);
        setCatDraft(selCat?.name ?? ""); setActive("catName");
        onProductsChanged?.();
        show(`"${p?.name ?? ""}" eliminado`, { type: "info" });
      }
      setConfirmDel(false);
    } catch (err) { show(err instanceof Error ? err.message : "Error al eliminar", { type: "error" }); }
    finally { if (mounted.current) setBusy(false); }
  };

  const stockClass = (s: number) =>
    s === 0 ? "ie-stk ie-stk--zero" : s <= critThreshold ? "ie-stk ie-stk--crit"
    : s <= lowThreshold ? "ie-stk ie-stk--low" : "ie-stk ie-stk--ok";
  const fieldCls = (f: Field) => "ie-field" + (active === f ? " ie-field--active" : "");
  const afLabel = active === "price" ? "Precio venta" : active === "cost" ? "Costo"
    : active === "stock" ? "Stock" : "Nombre";
  const editName = mode === "category"
    ? (editCatId ? "Editando categoría" : "Nueva categoría")
    : (selProdId ? "Editando producto" : "Nuevo producto");
  const dupeCat = mode === "category" && catDraft.trim().length > 0 &&
    cats.some(c => c.name.toLowerCase() === catDraft.trim().toLowerCase() && c.id !== editCatId);
  const canSaveCat = mode === "category" && catDraft.trim().length > 0 && !dupeCat;
  const canSaveProd = mode === "product" && pDraft.name.trim().length > 0 && parseFloat(pDraft.price) > 0;
  const counts = useMemo(() => {
    const m: Record<number, number> = {};
    products.forEach(p => { if (p.category_id != null) m[p.category_id] = (m[p.category_id] ?? 0) + 1; });
    return m;
  }, [products]);

  const q            = search.trim().toLowerCase();
  const filteredCats = q ? cats.filter(c => c.name.toLowerCase().includes(q)) : cats;
  const filteredProds = q ? products.filter(p => p.name.toLowerCase().includes(q)) : products;

  return (
    <div className="ie-root">
      <header className="ie-header ie-header--main">
        <h2 className="ie-main-title">Inventario</h2>
        <div className="ie-search-wrap">
          <svg className="ie-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/>
          </svg>
          <input
            className="ie-search"
            type="text"
            placeholder="Buscar categorías y productos…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="ie-search-clear" onClick={() => setSearch("")} aria-label="Limpiar búsqueda">×</button>
          )}
        </div>
        {onClose && (
          <button className="ie-done" onClick={onClose}>Listo</button>
        )}
      </header>

      <div className="ie-work">
        {/* Col 1 — categorías */}
        <section className="ie-col ie-col--cats">
          <div className="ie-col-head">
            <span className="ie-col-title">Categorías</span>
            <span className="ie-pill">{cats.length}</span>
          </div>
          <div className="ie-scroll ie-catlist">
            {filteredCats.length === 0 ? (
              <div className="ie-empty"><span>Sin resultados</span></div>
            ) : filteredCats.map(c => (
              <button
                key={c.id}
                className={`ie-catrow${c.id === selCatId ? " ie-catrow--active" : ""}`}
                onClick={() => selectCategory(c)}
              >
                <span className="ie-catname">{c.parent_id != null ? "↳ " : ""}{c.name}</span>
                <span className="ie-catcount">{c.id === selCatId ? (counts[c.id] ?? products.length) : "·"}</span>
              </button>
            ))}
          </div>
          {canEdit && (
            <div className="ie-col-foot">
              <button className="ie-newcat" onClick={newCategory}>+ Nueva categoría</button>
            </div>
          )}
        </section>

        {/* Col 2 — productos */}
        <section className="ie-col ie-col--prods">
          <div className="ie-col-head">
            <div className="ie-col-headmain">
              <div className="ie-col-title">Productos</div>
              <div className="ie-col-sub">{selCat ? selCat.name : "Sin categoría"}</div>
            </div>
            {canEdit && (
              <button className="ie-addprod" onClick={newProduct}>+ Producto</button>
            )}
          </div>
          <div className="ie-prodhead">
            <span>Artículo</span>
            <span className="ie-r">Precio</span>
            <span className="ie-c">Stock</span>
          </div>
          <div className="ie-scroll ie-prodlist">
            {filteredProds.length === 0 ? (
              <div className="ie-empty">
                <b>{q ? "Sin resultados" : "Sin productos"}</b>
                <span>{q ? `No hay productos que coincidan con "${search}"` : canEdit ? "Usa + Producto para agregar el primero" : "Esta categoría no tiene productos"}</span>
              </div>
            ) : filteredProds.map(p => (
              <button
                key={p.id}
                className={`ie-prodrow${p.id === selProdId ? " ie-prodrow--active" : ""}`}
                onClick={() => canEdit ? selectProduct(p) : undefined}
              >
                <span className="ie-prodname">{p.name}</span>
                <span className="ie-prodprice">{fmtQ(p.price)}</span>
                <span className={stockClass(p.stock)}>{p.stock}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Col 3 — editor */}
        {canEdit && (
          <section className="ie-col ie-col--editor">
            <div className="ie-mode">
              <span className={`ie-modechip${mode === "product" ? " ie-modechip--prod" : ""}`}>{editName}</span>
            </div>

            {mode === "category" ? (
              <>
                <label className="ie-label">Nombre de la categoría</label>
                <input
                  className={fieldCls("catName") + " ie-field--big"}
                  value={catDraft}
                  readOnly
                  onClick={() => setActive("catName")}
                  placeholder="Ej. Bebidas calientes"
                />
                {dupeCat && <div className="ie-dupe">Ya existe una categoría con ese nombre</div>}
                <button
                  className="ie-primary"
                  disabled={!canSaveCat || busy}
                  onClick={() => void confirm()}
                >
                  {editCatId ? "Guardar categoría" : "Crear categoría"}
                </button>
                {editCatId && (
                  <button
                    className={`ie-delete${confirmDel ? " ie-delete--confirm" : ""}`}
                    disabled={busy}
                    onClick={() => void deleteCurrent()}
                  >
                    {confirmDel ? "¿Confirmar eliminación?" : "Eliminar categoría"}
                  </button>
                )}
                <p className="ie-hint">Toca una categoría para renombrarla o eliminarla. Selecciónala para ver y editar sus productos.</p>
              </>
            ) : (
              <>
                <label className="ie-label">Nombre del producto</label>
                <input
                  className={fieldCls("name")}
                  value={pDraft.name}
                  readOnly
                  onClick={() => setActive("name")}
                  placeholder="Ej. Café americano"
                />
                <div className="ie-row2">
                  <div>
                    <label className="ie-label">Precio venta</label>
                    <div className={fieldCls("price")} onClick={() => setActive("price")}>
                      <span className="ie-cur">Q</span>{pDraft.price === "" ? "0.00" : pDraft.price}
                    </div>
                  </div>
                  <div>
                    <label className="ie-label">Costo</label>
                    <div className={fieldCls("cost")} onClick={() => setActive("cost")}>
                      <span className="ie-cur">Q</span>{pDraft.cost === "" ? "0.00" : pDraft.cost}
                    </div>
                  </div>
                </div>
                {recetaLock ? (
                  <p className="ie-receta">Stock calculado desde <b>Bodega</b> (producto por receta).</p>
                ) : (
                  <>
                    <label className="ie-label">Stock</label>
                    <div className={fieldCls("stock")} onClick={() => setActive("stock")}>
                      {pDraft.stock === "" ? "0" : pDraft.stock}
                    </div>
                  </>
                )}
                <button
                  className="ie-primary"
                  disabled={!canSaveProd || busy}
                  onClick={() => void confirm()}
                >
                  {selProdId ? "Guardar producto" : "Crear producto"}
                </button>
                {selProdId && (
                  <button
                    className={`ie-delete${confirmDel ? " ie-delete--confirm" : ""}`}
                    disabled={busy}
                    onClick={() => void deleteCurrent()}
                  >
                    {confirmDel ? "¿Confirmar eliminación?" : "Eliminar producto"}
                  </button>
                )}
              </>
            )}
          </section>
        )}
      </div>

      {/* Teclado anclado — solo admins */}
      {canEdit && (
        <div className="ie-keyboard">
          <div className="ie-kb-bar">Teclado táctil · {afLabel}</div>
          <div className="ie-kb-rows" onPointerDown={onKeyTap}>
            {KEY_ROWS.map((row, i) => (
              <div className="ie-kb-row" key={i}>
                {row.map(k => <button key={k} className="ie-key" data-key={k}>{k}</button>)}
              </div>
            ))}
            <div className="ie-kb-row ie-kb-row--act">
              <button className="ie-key ie-key--back" data-action="backspace">⌫</button>
              <button className="ie-key ie-key--space" data-action="space">espacio</button>
              <button className="ie-key ie-key--enter" data-action="enter">Listo ⏎</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
