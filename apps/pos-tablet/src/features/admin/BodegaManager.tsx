import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@pos/ui-kit";
import { apiRequest } from "../../services/api";
import "./BodegaManager.css";

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface Insumo {
  id:             number;
  nombre:         string;
  unidad_base:    string;
  stock_actual:   number;
  stock_min:      number;
  stock_critico:  number;
  costo_unitario: number;
  activo:         number;
}

interface ProductoBodega {
  id:           number;
  name:         string;
  tipo_stock:   "directo" | "receta";
  receta_count: number;
  category_name?: string;
}

interface RecetaItem {
  insumo_id:            number;
  insumo_nombre:        string;
  unidad_base:          string;
  cantidad_por_porcion: number;
}

type InsumoMode  = "idle" | "new" | "edit" | "compra" | "ajuste";
type RecetaMode  = "idle" | "add_ing";
type ActiveField = "nombre" | "min" | "crit" | "cantidad" | "factor" | "costo" | "notas" | "ajuste" | "qty" | null;

/* ── Constants ──────────────────────────────────────────────────────────────── */

const KEY_ROWS = [
  ["1","2","3","4","5","6","7","8","9","0"],
  ["q","w","e","r","t","y","u","i","o","p"],
  ["a","s","d","f","g","h","j","k","l","ñ"],
  ["z","x","c","v","b","n","m","."],
];

const UNIDADES = ["pieza", "litro", "gramo", "ml", "libra"];
const UNIDADES_COMPRA: Record<string, string[]> = {
  pieza: ["libra", "kilo", "caja", "unidad"],
  litro: ["litro", "barril"],
  gramo: ["gramo", "kilo", "libra"],
  ml:    ["ml", "litro", "botella"],
  libra: ["libra", "kilo"],
};
const NUMERIC_FIELDS = new Set(["min", "crit", "cantidad", "factor", "costo", "ajuste", "qty"]);
const KB_LABEL: Partial<Record<string, string>> = {
  nombre:   "nombre del insumo",
  min:      "stock mínimo",
  crit:     "stock crítico",
  cantidad: "cantidad comprada",
  factor:   "factor de conversión",
  costo:    "costo total (Q)",
  notas:    "notas",
  ajuste:   "cantidad real",
  qty:      "cantidad por porción",
};

/* ── Helpers ────────────────────────────────────────────────────────────────── */

const fmtQ = (n: number) =>
  new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ", minimumFractionDigits: 2 }).format(n);

const fmtNum = (n: number, dec = 1) =>
  Number(n).toFixed(dec).replace(/\.0$/, "");

const safeNum = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

const unwrap = <T,>(p: unknown): T =>
  (p && typeof p === "object" && "data" in p) ? (p as { data: T }).data : p as T;

const stockLevel = (ins: Insumo): "ok" | "low" | "crit" | "zero" => {
  const s = ins.stock_actual;
  if (s <= 0)                 return "zero";
  if (s <= ins.stock_critico) return "crit";
  if (s <= ins.stock_min)     return "low";
  return "ok";
};

/* ── Component ──────────────────────────────────────────────────────────────── */

export default function BodegaManager({ role = "admin" }: { role?: string }) {
  const { show }   = useToast();
  const mountedRef = useRef(true);
  const canEdit    = role === "admin";

  /* Navigation */
  const [subTab, setSubTab] = useState<"insumos" | "recetas">("insumos");

  /* Insumos data */
  const [insumos,      setInsumos]      = useState<Insumo[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [selInsumoId,  setSelInsumoId]  = useState<number | null>(null);
  const [insumoMode,   setInsumoMode]   = useState<InsumoMode>("idle");

  /* Insumo form fields */
  const [iNombre, setINombre] = useState("");
  const [iUnidad, setIUnidad] = useState("pieza");
  const [iMin,    setIMin]    = useState("");
  const [iCrit,   setICrit]   = useState("");

  /* Compra fields */
  const [cCantidad, setCCantidad] = useState("");
  const [cUnidad,   setCUnidad]   = useState("libra");
  const [cFactor,   setCFactor]   = useState("");
  const [cCosto,    setCCosto]    = useState("");
  const [cNotas,    setCNotas]    = useState("");

  /* Ajuste */
  const [ajusteVal, setAjusteVal] = useState("");

  /* Recetas data */
  const [productos,    setProductos]   = useState<ProductoBodega[]>([]);
  const [loadingProds, setLoadingProds] = useState(false);
  const prodsLoadedRef = useRef(false);
  const [selProdId,    setSelProdId]   = useState<number | null>(null);
  const [recetaItems,  setRecetaItems] = useState<RecetaItem[]>([]);
  const [recetaMode,   setRecetaMode]  = useState<RecetaMode>("idle");
  const [ingInsumoId,  setIngInsumoId] = useState<number | null>(null);
  const [ingQty,       setIngQty]      = useState("");

  /* UI state */
  const [activeField, setActiveField] = useState<ActiveField>(null);
  const [busy,        setBusy]        = useState(false);
  const [confirmDel,  setConfirmDel]  = useState(false);

  /* Derived */
  const selInsumo  = insumos.find(i => i.id === selInsumoId) ?? null;
  const selProd    = productos.find(p => p.id === selProdId) ?? null;
  const ingInsumo  = insumos.find(i => i.id === ingInsumoId) ?? null;
  const compraBase = safeNum(cCantidad) * safeNum(cFactor) || safeNum(cCantidad);
  const compraCostU = compraBase > 0 ? safeNum(cCosto) / compraBase : 0;
  const factorNeeded = insumoMode === "compra" && selInsumo !== null && selInsumo.unidad_base !== cUnidad;

  /* ── Load ──────────────────────────────────────────────────────────────────── */

  const loadInsumos = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await apiRequest("/bodega/insumos");
      if (mountedRef.current) setInsumos(unwrap<Insumo[]>(raw));
    } catch {
      if (mountedRef.current) show("Error cargando insumos", { type: "error" });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [show]);

  const loadProductos = useCallback(async () => {
    if (prodsLoadedRef.current) return;
    setLoadingProds(true);
    try {
      const raw = await apiRequest("/bodega/productos");
      if (mountedRef.current) {
        setProductos(unwrap<ProductoBodega[]>(raw));
        prodsLoadedRef.current = true;
      }
    } catch {
      if (mountedRef.current) show("Error cargando productos", { type: "error" });
    } finally {
      if (mountedRef.current) setLoadingProds(false);
    }
  }, [show]);

  useEffect(() => {
    mountedRef.current = true;
    void loadInsumos();
    return () => { mountedRef.current = false; };
  }, [loadInsumos]);

  useEffect(() => {
    if (subTab === "recetas") void loadProductos();
  }, [subTab, loadProductos]);

  /* ── Navigation ────────────────────────────────────────────────────────────── */

  const selectInsumo = (id: number) => {
    setSelInsumoId(id);
    setInsumoMode("idle");
    setActiveField(null);
    setConfirmDel(false);
  };

  const openNewInsumo = () => {
    setSelInsumoId(null);
    setINombre(""); setIUnidad("pieza"); setIMin(""); setICrit("");
    setInsumoMode("new");
    setActiveField("nombre");
    setConfirmDel(false);
  };

  const openEdit = () => {
    if (!selInsumo) return;
    setINombre(selInsumo.nombre);
    setIUnidad(selInsumo.unidad_base);
    setIMin(String(selInsumo.stock_min));
    setICrit(String(selInsumo.stock_critico));
    setInsumoMode("edit");
    setActiveField("nombre");
    setConfirmDel(false);
  };

  const openCompra = () => {
    if (!selInsumo) return;
    setCCantidad(""); setCFactor(""); setCCosto(""); setCNotas("");
    setCUnidad(UNIDADES_COMPRA[selInsumo.unidad_base]?.[0] ?? "libra");
    setInsumoMode("compra");
    setActiveField("cantidad");
  };

  const openAjuste = () => {
    if (!selInsumo) return;
    setAjusteVal(String(Math.round(Math.max(0, selInsumo.stock_actual))));
    setInsumoMode("ajuste");
    setActiveField("ajuste");
  };

  const selectProduct = async (prod: ProductoBodega) => {
    setSelProdId(prod.id);
    setRecetaMode("idle");
    setIngInsumoId(null);
    setIngQty("");
    setActiveField(null);
    setRecetaItems([]);
    try {
      const raw   = await apiRequest(`/bodega/receta/${prod.id}`);
      const items = unwrap<RecetaItem[]>(raw);
      if (mountedRef.current) setRecetaItems(items);
    } catch {
      show("Error cargando receta", { type: "error" });
    }
  };

  /* ── Save functions ─────────────────────────────────────────────────────────── */

  const saveInsumo = async () => {
    if (!iNombre.trim()) { show("Nombre requerido", { type: "warning" }); return; }
    setBusy(true);
    try {
      const body = { nombre: iNombre.trim(), unidad_base: iUnidad, stock_min: safeNum(iMin), stock_critico: safeNum(iCrit) };
      if (insumoMode === "new") {
        const created = unwrap<Insumo>(await apiRequest("/bodega/insumos", { method: "POST", body: JSON.stringify(body) }));
        if (mountedRef.current) {
          setInsumos(p => [...p, created]);
          setSelInsumoId(created.id);
          setInsumoMode("idle");
          setActiveField(null);
          show("Insumo creado", { type: "success" });
        }
      } else if (selInsumoId) {
        const updated = unwrap<Insumo>(await apiRequest(`/bodega/insumos/${selInsumoId}`, { method: "PUT", body: JSON.stringify(body) }));
        if (mountedRef.current) {
          setInsumos(p => p.map(x => x.id === updated.id ? updated : x));
          setInsumoMode("idle");
          setActiveField(null);
          show("Guardado", { type: "success" });
        }
      }
    } catch (e) {
      show(e instanceof Error ? e.message : "Error al guardar", { type: "error" });
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const saveCompra = async () => {
    if (!selInsumoId) return;
    if (!safeNum(cCantidad)) { show("Cantidad requerida", { type: "warning" }); return; }
    if (!safeNum(cCosto))    { show("Costo requerido",    { type: "warning" }); return; }
    const factor = factorNeeded ? safeNum(cFactor) : 1;
    if (factorNeeded && !factor) { show("Factor de conversión requerido", { type: "warning" }); return; }
    setBusy(true);
    try {
      const body = {
        cantidad_compra: safeNum(cCantidad),
        unidad_compra:   cUnidad,
        factor_a_base:   factor,
        costo_total:     safeNum(cCosto),
        notas:           cNotas || null,
      };
      const updated = unwrap<Insumo>(await apiRequest(`/bodega/insumos/${selInsumoId}/compra`, { method: "POST", body: JSON.stringify(body) }));
      if (mountedRef.current) {
        setInsumos(p => p.map(x => x.id === updated.id ? updated : x));
        setInsumoMode("idle");
        setActiveField(null);
        show("Compra registrada", { type: "success" });
      }
    } catch (e) {
      show(e instanceof Error ? e.message : "Error al registrar", { type: "error" });
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const saveAjuste = async () => {
    if (!selInsumoId || !selInsumo) return;
    const val = safeNum(ajusteVal);
    setBusy(true);
    try {
      const updated = unwrap<Insumo>(await apiRequest(`/bodega/insumos/${selInsumoId}/ajuste`, {
        method: "POST",
        body: JSON.stringify({ nueva_cantidad: val }),
      }));
      if (mountedRef.current) {
        setInsumos(p => p.map(x => x.id === updated.id ? updated : x));
        setInsumoMode("idle");
        setActiveField(null);
        show(`Stock ajustado a ${fmtNum(val, 1)} ${selInsumo.unidad_base}`, { type: "success" });
      }
    } catch (e) {
      show(e instanceof Error ? e.message : "Error al ajustar", { type: "error" });
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const deleteInsumo = async () => {
    if (!selInsumoId) return;
    if (!confirmDel) { setConfirmDel(true); return; }
    setBusy(true);
    try {
      await apiRequest(`/bodega/insumos/${selInsumoId}`, { method: "DELETE" });
      if (mountedRef.current) {
        setInsumos(p => p.filter(x => x.id !== selInsumoId));
        setSelInsumoId(null);
        setInsumoMode("idle");
        setActiveField(null);
        setConfirmDel(false);
        show("Insumo eliminado", { type: "info" });
      }
    } catch (e) {
      show(e instanceof Error ? e.message : "Error al eliminar", { type: "error" });
      if (mountedRef.current) setConfirmDel(false);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const addIngredient = () => {
    if (!ingInsumo) return;
    const qty = safeNum(ingQty);
    if (!qty) { show("Ingresa la cantidad", { type: "warning" }); return; }
    setRecetaItems(p => {
      const existing = p.find(x => x.insumo_id === ingInsumo.id);
      if (existing) return p.map(x => x.insumo_id === ingInsumo.id ? { ...x, cantidad_por_porcion: qty } : x);
      return [...p, { insumo_id: ingInsumo.id, insumo_nombre: ingInsumo.nombre, unidad_base: ingInsumo.unidad_base, cantidad_por_porcion: qty }];
    });
    setIngInsumoId(null);
    setIngQty("");
    setRecetaMode("idle");
    setActiveField(null);
  };

  const saveReceta = async () => {
    if (!selProdId) return;
    setBusy(true);
    try {
      const ingredientes = recetaItems.map(x => ({ insumo_id: x.insumo_id, cantidad_por_porcion: x.cantidad_por_porcion }));
      await apiRequest(`/bodega/receta/${selProdId}`, { method: "PUT", body: JSON.stringify({ ingredientes }) });
      const tipo: "directo" | "receta" = ingredientes.length > 0 ? "receta" : "directo";
      if (mountedRef.current) {
        setProductos(p => p.map(x => x.id === selProdId ? { ...x, tipo_stock: tipo, receta_count: ingredientes.length } : x));
        show("Receta guardada", { type: "success" });
      }
    } catch (e) {
      show(e instanceof Error ? e.message : "Error al guardar receta", { type: "error" });
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  /* ── Keyboard ───────────────────────────────────────────────────────────────── */

  const applyToActive = (fn: (prev: string) => string) => {
    switch (activeField) {
      case "nombre":   setINombre(fn);    break;
      case "min":      setIMin(fn);       break;
      case "crit":     setICrit(fn);      break;
      case "cantidad": setCCantidad(fn);  break;
      case "factor":   setCFactor(fn);    break;
      case "costo":    setCCosto(fn);     break;
      case "notas":    setCNotas(fn);     break;
      case "ajuste":   setAjusteVal(fn);  break;
      case "qty":      setIngQty(fn);     break;
    }
  };

  const handleConfirm = async () => {
    if (busy) return;
    if (insumoMode === "new" || insumoMode === "edit") { await saveInsumo(); return; }
    if (insumoMode === "compra")                       { await saveCompra(); return; }
    if (insumoMode === "ajuste")                       { await saveAjuste(); return; }
    if (recetaMode === "add_ing" && ingInsumoId)       { addIngredient();   return; }
  };

  const onKeyTap = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!activeField) return;
    const el = (e.target as HTMLElement).closest("[data-key],[data-action]") as HTMLElement | null;
    if (!el) return;
    const key    = el.dataset.key;
    const action = el.dataset.action;
    if (action === "backspace") { applyToActive(p => p.slice(0, -1)); return; }
    if (action === "space") {
      if (!NUMERIC_FIELDS.has(activeField)) applyToActive(p => p + " ");
      return;
    }
    if (action === "enter") { void handleConfirm(); return; }
    if (key) {
      if (NUMERIC_FIELDS.has(activeField) && !/[\d.]/.test(key)) return;
      applyToActive(p => (key === "." && p.includes(".")) ? p : p + key);
    }
  };

  const showKeyboard = canEdit && activeField !== null;

  /* ── Render ─────────────────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontWeight: 600 }}>
        Cargando bodega...
      </div>
    );
  }

  return (
    <div className="be-root">

      {/* ── Header ── */}
      <header className="be-header">
        <h2 className="be-main-title">Bodega</h2>
        <div className="be-tabs">
          <button
            className={`be-tab${subTab === "insumos" ? " be-tab--active" : ""}`}
            onClick={() => { setSubTab("insumos"); setActiveField(null); setInsumoMode("idle"); }}
          >Insumos</button>
          <button
            className={`be-tab${subTab === "recetas" ? " be-tab--active" : ""}`}
            onClick={() => { setSubTab("recetas"); setActiveField(null); setRecetaMode("idle"); }}
          >Recetas</button>
        </div>
      </header>

      {/* ── Work area ── */}
      <div className="be-work">

        {subTab === "insumos" ? (
          <>
            {/* Col 1: Insumos list */}
            <section className="be-col be-col--list">
              <div className="be-col-head">
                <div className="be-col-headmain">
                  <div className="be-col-title">Insumos</div>
                  <div className="be-col-sub">{insumos.length} materias primas</div>
                </div>
                <span className="be-pill">{insumos.length}</span>
              </div>
              <div className="be-scroll">
                <div className="be-itemlist">
                  {insumos.map(ins => {
                    const lvl = stockLevel(ins);
                    return (
                      <button
                        key={ins.id}
                        className={`be-itemrow${selInsumoId === ins.id ? " be-itemrow--active" : ""}`}
                        onClick={() => selectInsumo(ins.id)}
                      >
                        <div className="be-itemname">{ins.nombre}</div>
                        <div className={`be-itemstk be-itemstk--${lvl}`}>
                          {fmtNum(ins.stock_actual, ins.stock_actual % 1 === 0 ? 0 : 1)}
                          <span className="be-itemstk-unit"> {ins.unidad_base}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              {canEdit && (
                <div className="be-col-foot">
                  <button className="be-newitem" onClick={openNewInsumo}>+ Nuevo insumo</button>
                </div>
              )}
            </section>

            {/* Col 2: Insumo detail + actions */}
            <section className="be-col be-col--detail">
              {selInsumo ? (
                <>
                  <div className="be-col-head">
                    <div className="be-col-headmain">
                      <div className="be-col-title">{selInsumo.nombre}</div>
                      <div className="be-col-sub">{selInsumo.unidad_base}</div>
                    </div>
                  </div>
                  <div className="be-scroll">
                    <div className="be-detail-body">
                      <div className={`be-detail-stock be-detail-stock--${stockLevel(selInsumo)}`}>
                        <div className="be-detail-stock-val">
                          {fmtNum(selInsumo.stock_actual, selInsumo.stock_actual % 1 === 0 ? 0 : 1)}
                        </div>
                        <div className="be-detail-stock-unit">{selInsumo.unidad_base}</div>
                        <div className="be-detail-stock-label">en existencia</div>
                      </div>
                      <div className="be-thresholds">
                        <div className="be-threshold-item">
                          <span className="be-threshold-label">Mínimo</span>
                          <span className="be-threshold-val be-threshold-val--low">{fmtNum(selInsumo.stock_min, 0)}</span>
                        </div>
                        <div className="be-threshold-item">
                          <span className="be-threshold-label">Crítico</span>
                          <span className="be-threshold-val be-threshold-val--crit">{fmtNum(selInsumo.stock_critico, 0)}</span>
                        </div>
                        {selInsumo.costo_unitario > 0 && (
                          <div className="be-threshold-item">
                            <span className="be-threshold-label">Costo</span>
                            <span className="be-threshold-val">{fmtQ(selInsumo.costo_unitario)}</span>
                          </div>
                        )}
                      </div>
                      <div className="be-action-list">
                        <button className="be-action-btn be-action-btn--compra" onClick={openCompra}>
                          <span className="be-action-icon">📦</span>
                          <div>
                            <div className="be-action-label">Registrar compra</div>
                            <div className="be-action-sub">Agregar stock al inventario</div>
                          </div>
                        </button>
                        <button className="be-action-btn be-action-btn--ajuste" onClick={openAjuste}>
                          <span className="be-action-icon">🔢</span>
                          <div>
                            <div className="be-action-label">Ajuste físico</div>
                            <div className="be-action-sub">Corregir cantidad real</div>
                          </div>
                        </button>
                        {canEdit && (
                          <button className="be-action-btn be-action-btn--edit" onClick={openEdit}>
                            <span className="be-action-icon">✏️</span>
                            <div>
                              <div className="be-action-label">Editar datos</div>
                              <div className="be-action-sub">Nombre, unidad, umbrales</div>
                            </div>
                          </button>
                        )}
                        {canEdit && (
                          <button
                            className={`be-delete${confirmDel ? " be-delete--confirm" : ""}`}
                            onClick={() => void deleteInsumo()}
                            disabled={busy}
                          >
                            {confirmDel ? "¿Confirmar eliminación?" : "Eliminar insumo"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="be-empty">
                  <div className="be-empty-icon">📦</div>
                  <div className="be-empty-title">Selecciona un insumo</div>
                </div>
              )}
            </section>

            {/* Col 3: Editor */}
            {canEdit && (
              <section className="be-col be-col--editor">
                {insumoMode === "idle" && (
                  <div className="be-empty">
                    <div className="be-empty-title">{selInsumo ? "Elige una acción" : "—"}</div>
                  </div>
                )}

                {(insumoMode === "new" || insumoMode === "edit") && (
                  <>
                    <div className="be-mode">
                      <span className="be-modechip">{insumoMode === "new" ? "Nuevo insumo" : "Editar insumo"}</span>
                    </div>
                    <label className="be-label">Nombre del insumo</label>
                    <div
                      className={`be-field be-field--big${activeField === "nombre" ? " be-field--active" : ""}`}
                      onClick={() => setActiveField("nombre")}
                    >
                      {iNombre || <span className="be-placeholder">Nombre del insumo</span>}
                    </div>
                    <label className="be-label">Unidad de inventario</label>
                    <select className="be-select" value={iUnidad} onChange={e => setIUnidad(e.target.value)}>
                      {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <div className="be-row2">
                      <div>
                        <label className="be-label">Stock mínimo</label>
                        <div
                          className={`be-field${activeField === "min" ? " be-field--active" : ""}`}
                          onClick={() => setActiveField("min")}
                        >
                          {iMin ? <>{iMin}<span className="be-cur"> {iUnidad}</span></> : <span className="be-placeholder">0</span>}
                        </div>
                      </div>
                      <div>
                        <label className="be-label">Stock crítico</label>
                        <div
                          className={`be-field${activeField === "crit" ? " be-field--active" : ""}`}
                          onClick={() => setActiveField("crit")}
                        >
                          {iCrit ? <>{iCrit}<span className="be-cur"> {iUnidad}</span></> : <span className="be-placeholder">0</span>}
                        </div>
                      </div>
                    </div>
                    <button className="be-primary" onClick={() => void saveInsumo()} disabled={busy}>
                      {insumoMode === "new" ? "Crear insumo" : "Guardar cambios"}
                    </button>
                  </>
                )}

                {insumoMode === "compra" && selInsumo && (
                  <>
                    <div className="be-mode">
                      <span className="be-modechip be-modechip--compra">Registrar compra</span>
                    </div>
                    <div className="be-context">
                      {selInsumo.nombre} · stock actual: <strong>{fmtNum(selInsumo.stock_actual, 1)} {selInsumo.unidad_base}</strong>
                    </div>
                    <div className="be-row2">
                      <div>
                        <label className="be-label">Cantidad comprada</label>
                        <div
                          className={`be-field${activeField === "cantidad" ? " be-field--active" : ""}`}
                          onClick={() => setActiveField("cantidad")}
                        >
                          {cCantidad || <span className="be-placeholder">0</span>}
                        </div>
                      </div>
                      <div>
                        <label className="be-label">Unidad de compra</label>
                        <select className="be-select be-select--sm" value={cUnidad} onChange={e => setCUnidad(e.target.value)}>
                          {(UNIDADES_COMPRA[selInsumo.unidad_base] ?? ["libra"]).map(u => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {factorNeeded && (
                      <>
                        <label className="be-label">{selInsumo.unidad_base} por {cUnidad}</label>
                        <div
                          className={`be-field${activeField === "factor" ? " be-field--active" : ""}`}
                          onClick={() => setActiveField("factor")}
                        >
                          {cFactor || <span className="be-placeholder">Ej: 10</span>}
                        </div>
                      </>
                    )}
                    <label className="be-label">Costo total de la compra (Q)</label>
                    <div
                      className={`be-field${activeField === "costo" ? " be-field--active" : ""}`}
                      onClick={() => setActiveField("costo")}
                    >
                      {cCosto ? <><span className="be-cur">Q</span>{cCosto}</> : <span className="be-placeholder">Q 0.00</span>}
                    </div>
                    {compraBase > 0 && safeNum(cCosto) > 0 && (
                      <div className="be-preview">
                        Entran: <strong>{fmtNum(compraBase, 1)} {selInsumo.unidad_base}</strong>
                        {" · "}Costo: <strong>{fmtQ(compraCostU)}/{selInsumo.unidad_base}</strong>
                      </div>
                    )}
                    <label className="be-label">Notas (opcional)</label>
                    <div
                      className={`be-field${activeField === "notas" ? " be-field--active" : ""}`}
                      onClick={() => setActiveField("notas")}
                    >
                      {cNotas || <span className="be-placeholder">Proveedor, factura...</span>}
                    </div>
                    <button className="be-primary" onClick={() => void saveCompra()} disabled={busy}>
                      Registrar compra
                    </button>
                  </>
                )}

                {insumoMode === "ajuste" && selInsumo && (
                  <>
                    <div className="be-mode">
                      <span className="be-modechip be-modechip--ajuste">Ajuste físico</span>
                    </div>
                    <div className="be-context">
                      Stock en sistema: <strong>{fmtNum(selInsumo.stock_actual, 1)} {selInsumo.unidad_base}</strong>
                    </div>
                    <label className="be-label">Nueva cantidad ({selInsumo.unidad_base})</label>
                    <div
                      className={`be-field be-field--big be-field--num${activeField === "ajuste" ? " be-field--active" : ""}`}
                      onClick={() => setActiveField("ajuste")}
                    >
                      <span className="be-ajuste-val">{ajusteVal || "0"}</span>
                      <span className="be-cur"> {selInsumo.unidad_base}</span>
                    </div>
                    <button className="be-primary" onClick={() => void saveAjuste()} disabled={busy}>
                      Confirmar ajuste
                    </button>
                  </>
                )}
              </section>
            )}
          </>
        ) : (
          /* ── RECETAS ── */
          <>
            {/* Col 1: Products */}
            <section className="be-col be-col--list">
              <div className="be-col-head">
                <div className="be-col-headmain">
                  <div className="be-col-title">Productos</div>
                  <div className="be-col-sub">{productos.length} artículos</div>
                </div>
                <span className="be-pill">{productos.length}</span>
              </div>
              <div className="be-scroll">
                {loadingProds ? (
                  <div className="be-empty"><div className="be-empty-title">Cargando...</div></div>
                ) : (
                  <div className="be-itemlist">
                    {productos.map(prod => (
                      <button
                        key={prod.id}
                        className={`be-itemrow${selProdId === prod.id ? " be-itemrow--active" : ""}`}
                        onClick={() => void selectProduct(prod)}
                      >
                        <div className="be-itemname">{prod.name}</div>
                        <span className={`be-tipo${prod.tipo_stock === "receta" ? " be-tipo--receta" : " be-tipo--directo"}`}>
                          {prod.tipo_stock === "receta" ? `${prod.receta_count} ing.` : "Directo"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Col 2: Ingredient list */}
            <section className="be-col be-col--ing">
              {selProd ? (
                <>
                  <div className="be-col-head">
                    <div className="be-col-headmain">
                      <div className="be-col-title">{selProd.name}</div>
                      <div className="be-col-sub">{recetaItems.length} ingredientes</div>
                    </div>
                  </div>
                  <div className="be-scroll">
                    {recetaItems.length === 0 ? (
                      <div className="be-empty">
                        <div className="be-empty-icon">📋</div>
                        <div className="be-empty-title">Sin ingredientes</div>
                      </div>
                    ) : (
                      <div className="be-ing-list">
                        {recetaItems.map(item => (
                          <div key={item.insumo_id} className="be-ing-row">
                            <div className="be-ing-info">
                              <div className="be-ing-name">{item.insumo_nombre}</div>
                              <div className="be-ing-qty">
                                {fmtNum(item.cantidad_por_porcion, item.cantidad_por_porcion % 1 === 0 ? 0 : 2)} {item.unidad_base} / porción
                              </div>
                            </div>
                            {canEdit && (
                              <button
                                className="be-ing-remove"
                                onClick={() => setRecetaItems(p => p.filter(x => x.insumo_id !== item.insumo_id))}
                              >×</button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <div className="be-col-foot be-col-foot--row">
                      <button className="be-newitem" style={{ flex: 1 }} onClick={() => {
                        setRecetaMode("add_ing");
                        setIngInsumoId(null);
                        setIngQty("");
                        setActiveField(null);
                      }}>+ Ingrediente</button>
                      <button className="be-primary-sm" onClick={() => void saveReceta()} disabled={busy}>
                        Guardar receta
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="be-empty">
                  <div className="be-empty-icon">📋</div>
                  <div className="be-empty-title">Selecciona un producto</div>
                </div>
              )}
            </section>

            {/* Col 3: Add ingredient */}
            {canEdit && (
              <section className="be-col be-col--editor">
                {recetaMode === "idle" && (
                  <div className="be-empty">
                    <div className="be-empty-title">{selProd ? 'Toca "+ Ingrediente"' : "—"}</div>
                  </div>
                )}
                {recetaMode === "add_ing" && (
                  <>
                    <div className="be-mode">
                      <span className="be-modechip">Agregar ingrediente</span>
                    </div>
                    {!ingInsumoId ? (
                      <>
                        <label className="be-label" style={{ marginBottom: 6 }}>Selecciona el insumo</label>
                        <div className="be-selector-list">
                          {insumos.filter(i => i.activo).map(ins => (
                            <button
                              key={ins.id}
                              className="be-selector-item"
                              onClick={() => { setIngInsumoId(ins.id); setIngQty(""); setActiveField("qty"); }}
                            >
                              <span className="be-selector-name">{ins.nombre}</span>
                              <span className="be-selector-unit">{ins.unidad_base}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    ) : ingInsumo && (
                      <>
                        <div className="be-ing-selected">
                          <div className="be-ing-selected-name">{ingInsumo.nombre}</div>
                          <button className="be-ing-change" onClick={() => { setIngInsumoId(null); setActiveField(null); }}>Cambiar</button>
                        </div>
                        <label className="be-label">Cantidad por porción ({ingInsumo.unidad_base})</label>
                        <div
                          className={`be-field be-field--big${activeField === "qty" ? " be-field--active" : ""}`}
                          onClick={() => setActiveField("qty")}
                        >
                          {ingQty ? <>{ingQty}<span className="be-cur"> {ingInsumo.unidad_base}</span></> : <span className="be-placeholder">0</span>}
                        </div>
                        <button className="be-primary" onClick={addIngredient} disabled={!safeNum(ingQty)}>
                          Agregar ingrediente
                        </button>
                      </>
                    )}
                  </>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {/* ── Keyboard ── */}
      {showKeyboard && (
        <div className="be-keyboard" onMouseDown={onKeyTap}>
          <div className="be-kb-bar">{KB_LABEL[activeField ?? ""] ?? ""}</div>
          <div className="be-kb-rows">
            {KEY_ROWS.map((row, ri) => (
              <div key={ri} className="be-kb-row">
                {ri === KEY_ROWS.length - 1 && (
                  <button className="be-key be-key--back" data-action="backspace">⌫</button>
                )}
                {row.map(k => (
                  <button key={k} className="be-key" data-key={k}>{k}</button>
                ))}
              </div>
            ))}
            <div className="be-kb-row">
              <button className="be-key be-key--space" data-action="space">espacio</button>
              <button className="be-key be-key--enter" data-action="enter">Listo ⏎</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
