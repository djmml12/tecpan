# Integración — Editor de inventario integrado (categorías + productos)

> Para **Claude Code**. Repo: `djmml12/tecpan`. App: **`apps/pos-tablet`**.
> Reemplaza las hojas flotantes (`BottomSheet`) de **crear/renombrar/eliminar categoría** y **crear/editar producto** por **un solo panel integrado** dentro de Inventario, con **teclado táctil anclado abajo en espacio reservado** (nunca tapa el contenido). Landscape, estilo Tecpancito más limpio.
>
> Diseño aprobado: `Gestor de Categorías.dc.html` (prototipo interactivo). Tres columnas: **Categorías → Productos de esa categoría → Editor contextual** (edita la categoría o el producto seleccionado) + teclado anclado.

---

## 0. Qué cambia

**Hoy** en `apps/pos-tablet/src/features/admin/InventoryManager.tsx`:
- `+ Categoría` → `<BottomSheet showCatForm>`; lápiz de chip → `<BottomSheet showCatRename>`.
- `+ Producto` / lápiz de fila → `<BottomSheet showForm>` (form de producto).
- El teclado global (`<TouchKeyboard>` en `AdminLayout`) flota `fixed` y tapa las hojas (problema reportado).

**Después**:
- Un panel **`InventoryEditor`** ocupa el área de contenido de Inventario (no flotante) y hace **todo**: crear/renombrar/eliminar categoría y crear/editar/eliminar producto.
- Columna 1 = categorías (seleccionables, + Nueva). Columna 2 = productos de la categoría activa (seleccionables, + Producto). Columna 3 = editor contextual.
- Teclado táctil **dentro del flujo** (espacio reservado), con **campo activo** resaltado y etiqueta "Teclado · {campo}". Edita texto y números (filtra dígitos/punto en precio/costo/stock).

**API: sin cambios.** Endpoints existentes:
- Categorías: `GET /categories?includeInactive=true` · `POST /categories {name}` · `PUT /categories/:id {name}` · `DELETE /categories/:id`
- Productos: `GET /products?category_id=:id&includeInactive=true` · `POST /products {name,price,cost_price,stock,category_id}` · `PUT /products/:id {...}` · `DELETE /products/:id`

> **Receta (BOM):** si `product.tipo_stock === "receta"`, el stock se calcula desde Bodega → el editor muestra una nota en vez del campo Stock y **no** envía `stock` en el PUT (igual que hoy en `InventoryManager`).

---

## 1. Ubicación recomendada

Panel en línea dentro de Inventario (el botón `+ Categoría`/`+ Producto` ya vive ahí; menos archivos). Alternativa de sub-vista propia en §6.

---

## 2. Componente nuevo: `InventoryEditor.tsx`

Crear `apps/pos-tablet/src/features/admin/InventoryEditor.tsx`. Carga sus propios productos por categoría (patrón `loadProductsFor` de `InventoryManager`). Los campos son `readOnly` para que el teclado global no se enganche; se escribe con el teclado anclado del panel hacia estado React.

```tsx
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
  onClose: () => void;
  /** El padre refresca su estado de categorías tras crear/renombrar/eliminar. */
  onCategoriesChanged: (next: Category[]) => void;
  /** El padre puede refrescar productos/badges si lo necesita. */
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
  onClose, onCategoriesChanged, onProductsChanged,
}: Props) {
  const { show } = useToast();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const [cats, setCats] = useState<Category[]>(categories);
  useEffect(() => { setCats(categories); }, [categories]);

  const firstCat = initialCatId ?? categories[0]?.id ?? null;
  const [selCatId, setSelCatId]   = useState<number | null>(firstCat);
  const [products, setProducts]   = useState<Product[]>([]);
  const [mode, setMode]           = useState<"category" | "product">("category");
  const [editCatId, setEditCatId] = useState<number | null>(firstCat); // null = creando categoría
  const [selProdId, setSelProdId] = useState<number | null>(null);     // null = creando producto
  const [catDraft, setCatDraft]   = useState<string>(categories.find(c => c.id === firstCat)?.name ?? "");
  const [pDraft, setPDraft]       = useState({ name: "", price: "", cost: "", stock: "" });
  const [active, setActive]       = useState<Field>("catName");
  const [recetaLock, setRecetaLock] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy]           = useState(false);

  /* cargar productos de la categoría activa */
  const loadProducts = useCallback(async (catId: number) => {
    try {
      const raw = await apiRequest(`/products?category_id=${catId}&includeInactive=true`);
      const data = (unwrap<unknown[]>(raw) as unknown[]).map(normProd).filter(p => p.is_active);
      if (mounted.current) setProducts(data);
    } catch { if (mounted.current) show("Error cargando productos", { type: "error" }); }
  }, [show]);

  useEffect(() => { if (selCatId != null) void loadProducts(selCatId); }, [selCatId, loadProducts]);

  const selCat = useMemo(() => cats.find(c => c.id === selCatId) ?? null, [cats, selCatId]);

  /* ── selección ── */
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

  /* ── teclado ── */
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

  /* ── guardar / eliminar ── */
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

  /* ── helpers de render ── */
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
    const m: Record<number, number> = {}; products.forEach(p => { if (p.category_id != null) m[p.category_id] = (m[p.category_id] ?? 0) + 1; });
    return m;
  }, [products]); // nota: solo cuenta la categoría cargada; ver §4.1 para conteos globales

  return (
    <div className="ie-root">
      <header className="ie-header">
        <div className="ie-crumb">
          <button className="ie-back" onClick={onClose}>‹ Inventario</button>
          <span className="ie-sep">/</span>
          <h2 className="ie-title">Categorías y productos</h2>
        </div>
        <button className="ie-done" onClick={onClose}>Listo</button>
      </header>

      <div className="ie-work">
        {/* Col 1 — categorías */}
        <section className="ie-col ie-col--cats">
          <div className="ie-col-head"><span className="ie-col-title">Categorías</span><span className="ie-pill">{cats.length}</span></div>
          <div className="ie-scroll ie-catlist">
            {cats.map(c => (
              <button key={c.id} className={`ie-catrow${c.id === selCatId ? " ie-catrow--active" : ""}`} onClick={() => selectCategory(c)}>
                <span className="ie-catname">{c.parent_id != null ? "↳ " : ""}{c.name}</span>
                <span className="ie-catcount">{counts[c.id] ?? (c.id === selCatId ? products.length : "·")}</span>
              </button>
            ))}
          </div>
          <div className="ie-col-foot">
            <button className="ie-newcat" onClick={newCategory}>+ Nueva categoría</button>
          </div>
        </section>

        {/* Col 2 — productos */}
        <section className="ie-col ie-col--prods">
          <div className="ie-col-head">
            <div className="ie-col-headmain">
              <div className="ie-col-title">Productos</div>
              <div className="ie-col-sub">{selCat ? selCat.name : "Sin categoría"}</div>
            </div>
            <button className="ie-addprod" onClick={newProduct}>+ Producto</button>
          </div>
          <div className="ie-prodhead"><span>Artículo</span><span className="ie-r">Precio</span><span className="ie-c">Stock</span></div>
          <div className="ie-scroll ie-prodlist">
            {products.length === 0 ? (
              <div className="ie-empty"><b>Sin productos</b><span>Usa + Producto para agregar el primero</span></div>
            ) : products.map(p => (
              <button key={p.id} className={`ie-prodrow${p.id === selProdId ? " ie-prodrow--active" : ""}`} onClick={() => selectProduct(p)}>
                <span className="ie-prodname">{p.name}</span>
                <span className="ie-prodprice">{fmtQ(p.price)}</span>
                <span className={stockClass(p.stock)}>{p.stock}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Col 3 — editor */}
        <section className="ie-col ie-col--editor">
          <div className="ie-mode">
            <span className={`ie-modechip${mode === "product" ? " ie-modechip--prod" : ""}`}>{editName}</span>
          </div>

          {mode === "category" ? (
            <>
              <label className="ie-label">Nombre de la categoría</label>
              <input className={fieldCls("catName") + " ie-field--big"} value={catDraft} readOnly onClick={() => setActive("catName")} placeholder="Ej. Bebidas calientes" />
              {dupeCat && <div className="ie-dupe">Ya existe una categoría con ese nombre</div>}
              <button className="ie-primary" disabled={!canSaveCat || busy} onClick={() => void confirm()}>{editCatId ? "Guardar categoría" : "Crear categoría"}</button>
              {editCatId && <button className={`ie-delete${confirmDel ? " ie-delete--confirm" : ""}`} disabled={busy} onClick={() => void deleteCurrent()}>{confirmDel ? "¿Confirmar eliminación?" : "Eliminar categoría"}</button>}
              <p className="ie-hint">Toca una categoría para renombrarla o eliminarla. Selecciónala para ver y editar sus productos.</p>
            </>
          ) : (
            <>
              <label className="ie-label">Nombre del producto</label>
              <input className={fieldCls("name")} value={pDraft.name} readOnly onClick={() => setActive("name")} placeholder="Ej. Café americano" />
              <div className="ie-row2">
                <div><label className="ie-label">Precio venta</label>
                  <div className={fieldCls("price")} onClick={() => setActive("price")}><span className="ie-cur">Q</span>{pDraft.price === "" ? "0.00" : pDraft.price}</div></div>
                <div><label className="ie-label">Costo</label>
                  <div className={fieldCls("cost")} onClick={() => setActive("cost")}><span className="ie-cur">Q</span>{pDraft.cost === "" ? "0.00" : pDraft.cost}</div></div>
              </div>
              {recetaLock ? (
                <p className="ie-receta">Stock calculado desde <b>Bodega</b> (producto por receta).</p>
              ) : (
                <><label className="ie-label">Stock</label>
                  <div className={fieldCls("stock")} onClick={() => setActive("stock")}>{pDraft.stock === "" ? "0" : pDraft.stock}</div></>
              )}
              <button className="ie-primary" disabled={!canSaveProd || busy} onClick={() => void confirm()}>{selProdId ? "Guardar producto" : "Crear producto"}</button>
              {selProdId && <button className={`ie-delete${confirmDel ? " ie-delete--confirm" : ""}`} disabled={busy} onClick={() => void deleteCurrent()}>{confirmDel ? "¿Confirmar eliminación?" : "Eliminar producto"}</button>}
            </>
          )}
        </section>
      </div>

      {/* Teclado anclado */}
      <div className="ie-keyboard">
        <div className="ie-kb-bar">Teclado táctil · {afLabel}</div>
        <div className="ie-kb-rows" onPointerDown={onKeyTap}>
          {KEY_ROWS.map((row, i) => (
            <div className="ie-kb-row" key={i}>{row.map(k => <button key={k} className="ie-key" data-key={k}>{k}</button>)}</div>
          ))}
          <div className="ie-kb-row ie-kb-row--act">
            <button className="ie-key ie-key--back" data-action="backspace">⌫</button>
            <button className="ie-key ie-key--space" data-action="space">espacio</button>
            <button className="ie-key ie-key--enter" data-action="enter">Listo ⏎</button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

> **Conteo por categoría:** el componente solo carga productos de la categoría activa, así que las demás muestran `·`. Para mostrar el número real en todas, pásalo desde `InventoryManager` (que ya tiene `allProducts`) — ver §4.1.

---

## 3. Estilos: `inventory-editor.css`

Crear `apps/pos-tablet/src/features/admin/inventory-editor.css`. Copia 1:1 los valores del prototipo `Gestor de Categorías.dc.html` (mismas medidas/colores). Mapa de clases:

| Clase | En el prototipo (inline) |
|---|---|
| `.ie-root` | contenedor `main`, `flex column`, `background:var(--canvas)` |
| `.ie-header` / `.ie-crumb` / `.ie-back` / `.ie-title` / `.ie-done` | header: padding `12px 20px`, borde inferior, `h1 Archivo 20px`, botón "Listo" pill mostaza |
| `.ie-work` | `flex; gap:14px; padding:14px 20px; min-height:0` |
| `.ie-col` | `display:flex; flex-direction:column; background:#F4ECD8; border:1.5px solid rgba(120,90,50,.16); border-radius:18px; overflow:hidden` |
| `.ie-col--cats` `width:226px;flex:none` · `.ie-col--prods` `width:356px;flex:none` · `.ie-col--editor` `flex:1;background:#F8F2DD;padding:16px;gap:11px` |
| `.ie-catrow` / `--active` | fila `11px 12px`, radius 12, activa = gradiente mostaza `linear-gradient(160deg,#F5C944,#E8A813 70%,#D89A0E)` + sombra |
| `.ie-prodrow` / `--active` | grid `1fr 72px 58px`, `9px 16px`, activa `background:#FBE3A4` |
| `.ie-stk--ok/low/crit/zero` | badges de stock (verde/naranja/rojo/gris) — usa los mismos colores de `.inv-stock-badge--*` de `admin.css` |
| `.ie-field` / `--active` / `--big` | input/box: alto 50 (62 si `--big`), radius 13, fondo `#FFFDF6`; activo = `border:2px solid #E8A813; box-shadow:0 0 0 4px rgba(232,168,19,.18)` |
| `.ie-primary` | botón gradiente mostaza alto 52; `:disabled` → `#E8DCBE`, texto `#B0A180` |
| `.ie-delete` / `--confirm` | rojo suave `#F4C9BA`/`#8A2812`; confirm = sólido `#B33A1F` blanco |
| `.ie-keyboard` | `background:#E4DAC8; border-top; padding:6px 20px 10px` (en flujo, **no** `position:fixed`) |
| `.ie-kb-rows/.ie-kb-row/.ie-key` | teclas: alto 46, radius 10, blanco con borde inferior; `--back` naranja, `--space` flex, `--enter` mostaza |

```css
/* Esqueleto mínimo — completa el resto desde el prototipo */
.ie-root { flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--canvas); }
.ie-header { display:flex; align-items:center; gap:16px; padding:12px 20px; border-bottom:1px solid var(--border); background:var(--surface); flex:none; }
.ie-crumb { flex:1; min-width:0; display:flex; align-items:center; gap:9px; flex-wrap:nowrap; }
.ie-back { height:28px; padding:0 11px; border:1.5px solid var(--border); border-radius:999px; background:var(--canvas); color:var(--text-2); font:700 12px inherit; cursor:pointer; white-space:nowrap; }
.ie-sep { color:var(--text-3); }
.ie-title { margin:0; font-size:20px; font-weight:800; color:var(--text-1); white-space:nowrap; letter-spacing:-0.01em; }
.ie-done { height:34px; padding:0 18px; border:none; border-radius:999px; background:var(--primary); color:#2B1608; font:800 13px inherit; cursor:pointer; }
.ie-work { flex:1; min-height:0; display:flex; gap:14px; padding:14px 20px; }
.ie-col { display:flex; flex-direction:column; background:var(--surface); border:1.5px solid var(--border); border-radius:18px; overflow:hidden; }
.ie-col--cats { width:226px; flex:none; }
.ie-col--prods { width:356px; flex:none; }
.ie-col--editor { flex:1; min-width:0; background:var(--surface-raised); padding:16px; gap:11px; }
.ie-scroll { overflow-y:auto; min-height:0; }
.ie-scroll::-webkit-scrollbar { width:7px; } .ie-scroll::-webkit-scrollbar-thumb { background:#DECFAE; border-radius:999px; }
/* … (catrow, prodrow, stk, field, primary, delete, keyboard) — valores en el prototipo … */
.ie-keyboard { flex:none; background:#E4DAC8; border-top:1.5px solid rgba(120,90,50,.22); padding:6px 20px 10px; }
.ie-kb-bar { text-align:center; font:800 10.5px inherit; letter-spacing:.1em; text-transform:uppercase; color:#A89A7C; height:22px; }
.ie-kb-rows { display:flex; flex-direction:column; gap:7px; max-width:980px; margin:0 auto; }
.ie-kb-row { display:flex; gap:8px; justify-content:center; }
.ie-key { flex:1; max-width:90px; height:46px; display:flex; align-items:center; justify-content:center; font:700 18px inherit; color:#2B1608; background:#fff; border:1px solid rgba(0,0,0,.1); border-bottom:2px solid rgba(0,0,0,.18); border-radius:10px; cursor:pointer; text-transform:lowercase; touch-action:manipulation; }
.ie-key:active { transform:scale(.9); background:#e8e0d4; }
.ie-key--back { flex:none; width:118px; max-width:none; color:#C2500A; background:#FFF0E6; border-bottom-color:rgba(194,80,10,.32); }
.ie-key--space { flex:1; max-width:500px; font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:#6B5A3A; background:#D6CCBE; }
.ie-key--enter { flex:none; width:138px; max-width:none; font-weight:800; color:#2B1608; background:linear-gradient(160deg,#F5C944,var(--primary) 60%,var(--primary-dark)); border:none; border-bottom:2px solid rgba(120,80,10,.4); }
@media (min-aspect-ratio:1.45/1) and (max-aspect-ratio:1.75/1) and (max-width:1850px) { .ie-key { height:43px; } .ie-work { padding:12px 16px; gap:12px; } }
```

---

## 4. Conectar en `InventoryManager.tsx`

1. `import InventoryEditor from "./InventoryEditor";`
2. Estado: `const [editorOpen, setEditorOpen] = useState(false);` y `const [editorCatId, setEditorCatId] = useState<number | null>(null);`
3. Abrir:
   - `+ Categoría` → `() => { setEditorCatId(selectedCat); setEditorOpen(true); }`
   - `+ Producto` → `() => { setEditorCatId(selectedCat); setEditorOpen(true); }`
   - lápiz de chip → `() => { setEditorCatId(cat.id); setEditorOpen(true); }`
   - lápiz de fila de producto (opcional) → abre el editor en esa categoría.
4. Render (return temprano dentro del componente, antes del `inv-layout`):
   ```tsx
   if (editorOpen) {
     return (
       <InventoryEditor
         categories={categories}
         initialCatId={editorCatId}
         lowThreshold={lowThreshold}
         critThreshold={critThreshold}
         onClose={() => { setEditorOpen(false); if (selectedCat) void loadProductsFor(selectedCat); void loadAllProducts(); }}
         onCategoriesChanged={(next) => setCategories(next)}
         onProductsChanged={() => { void loadAllProducts(); }}
       />
     );
   }
   ```
5. **Elimina** del JSX los `<BottomSheet>` `showForm` (producto), `showCatForm`, `showCatRename`, y su estado/handlers asociados si ya no se usan (TS `noUnusedLocals` fallará si quedan muertos). Conserva el sheet de **ajuste de stock** (`showStock`) y el de **umbrales** (`showThresholds`) — son flujos aparte.
6. **Teclado global:** quita `showForm/showCatForm/showCatRename` del `useEffect` que llama `setKeyboardOpen(...)`. El editor trae su propio teclado anclado y sus campos son `readOnly` (el global los ignora).

### 4.1 Conteos globales (opcional)
Para que la columna de categorías muestre el conteo real de **todas** (no solo la activa), añade un prop `productCounts={Record<number,number>}` derivado de `allProducts` en `InventoryManager` y úsalo en `.ie-catcount` en vez del fallback `·`.

---

## 5. Teclado anclado (clave del rediseño)
- `.ie-keyboard` va **en el flujo** (hijo flex normal, no `fixed`). `.ie-work` usa `flex:1; min-height:0`, así que el área se encoge y **nunca** queda tapada.
- Modelo de **campo activo**: tocar un campo fija `active`; el teclado escribe a ese campo en estado. En precio/costo solo dígitos y `.`; en stock solo enteros. `Listo ⏎` confirma.
- Campos `readOnly` → no abren el teclado del SO ni se enganchan al `<TouchKeyboard>` global. Si quieres además teclado físico, quita `readOnly` y añade `onChange` por campo.

---

## 6. Alternativa — sub-vista propia
En `AdminLayout.tsx`: añade `"inventory-editor"` al type `AdminView`, un `navItem`, sube el estado de `categories`/umbrales a `AdminLayout` (hoy vive en `InventoryManager`) y renderiza `<InventoryEditor … onClose={() => setView("inventory")} />`. Por el acoplamiento del estado, el **panel en línea (§4) es más simple y recomendado**.

---

## 7. Checklist de prueba (tablet landscape)
- [ ] `+ Categoría`/`+ Producto` abren el panel sin hoja flotante; teclado anclado, sin tapar contenido.
- [ ] Categorías: crear, renombrar (toca → editar), eliminar (doble toque confirma), duplicado bloqueado.
- [ ] Seleccionar categoría carga sus productos en la columna central.
- [ ] Producto: `+ Producto` crea (nombre + precio>0 + costo + stock); tocar fila edita; Guardar/Eliminar funcionan; toasts correctos.
- [ ] Campo activo se resalta; teclado escribe en él; precio/costo aceptan `.`, stock solo enteros; `⌫`, `espacio`, `Listo ⏎`.
- [ ] Producto por receta (`tipo_stock==='receta'`): muestra nota de Bodega y no envía `stock`.
- [ ] Badges de stock con colores según umbrales (low 15 / crit 5 por defecto).
- [ ] "Listo"/"‹ Inventario" cierran y la lista de Inventario refleja los cambios.
- [ ] Surface Go (3:2): teclas a ~43px, todo entra en 800px de alto.
- [ ] `npm run dev:tablet` sin warnings TS (borra estado/handlers muertos del §5).

## 8. Estilo de trabajo (CLAUDE.md del repo)
Aplica los cambios directamente en los archivos, sin resúmenes. Comunica solo si hay una decisión de producto real (p. ej. elegir la sub-vista §6 en vez del panel §4).
