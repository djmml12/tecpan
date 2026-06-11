import {
  lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState,
} from "react";
import {
  BottomSheet, Button, NumKeypad, Spinner, TouchKeyboard, useToast,
} from "@pos/ui-kit";
import { apiRequest, getBackendBaseUrl } from "../../services/api";
import { usePullToRefresh } from "../../hooks/usePullToRefresh";
import "./pos.css";

const SplitBillSheet = lazy(() => import("./SplitBillSheet"));

/* ── Types ────────────────────────────────────────────────── */

interface Product {
  id: number;
  name: string;
  price: number | string;
  stock?: number | null;
  category_id?: number | null;
}

interface Category {
  id: number;
  name: string;
}

interface ProductStock {
  id: number;
  stock?: number | null;
}

interface CartItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  addedAt?: number;
}

interface PaidSale {
  id: number;
  monthly_number?: number;
  reference: string;
  total: number | string;
  tip_amount?: number | string;
  items_count?: number;
  created_at: string;
}

interface OpenTicket {
  id: string;
  label: string;
  cart: CartItem[];
  notes: string;
  createdAt: number;
}

const OPEN_TICKETS_KEY = "pos_open_tickets_v1";
const ACTIVE_CART_KEY  = "pos_active_cart_v1";
const STOCK_FALLBACK_REFRESH_MS = 60_000;

interface ActiveCartSnapshot {
  cart: CartItem[];
  orderNotes: string;
  activeTicketId: string | null;
}

interface SaleDetailItem {
  id: number;
  name: string;
  quantity: number;
  price: number;
  notes?: string;
}

/* ── Helpers ──────────────────────────────────────────────── */

const fmt = (n: number) =>
  new Intl.NumberFormat("es-GT", {
    style: "currency",
    currency: "GTQ",
    minimumFractionDigits: 2,
  }).format(n);

const toNum = (v: number | string | undefined | null): number =>
  typeof v === "string" ? parseFloat(v) || 0 : (v ?? 0);

/** Redondeo a 2 decimales (GTQ). Debe coincidir con money() del backend. */
const money = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const readActiveCart = (): ActiveCartSnapshot | null => {
  try {
    const saved = localStorage.getItem(ACTIVE_CART_KEY);
    return saved ? JSON.parse(saved) as ActiveCartSnapshot : null;
  } catch {
    return null;
  }
};

/* ── Inline SVG icons ─────────────────────────────────────── */

function ListIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function SortIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6"  x2="21" y2="6"  />
      <line x1="3" y1="12" x2="15" y2="12" />
      <line x1="3" y1="18" x2="9"  y2="18" />
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function PrintIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function EmptyTicketIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" />
      <line x1="8" y1="9" x2="10" y2="9" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

/* ── Regular product card ─────────────────────────────────── */

/* ── Main component ───────────────────────────────────────── */

interface Props {
  role: string;
  onGoToAdmin: () => void;
  onLogout: () => void;
}

type Screen = "pos" | "orders" | "completed";

export default function PosScreen({ role, onGoToAdmin, onLogout }: Props) {
  const { show } = useToast();
  const mountedRef = useRef(true);
  const catsRef = useRef<HTMLDivElement>(null);

  /* Products / categories */
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingProds, setLoadingProds] = useState(true);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [selectedCat, setSelectedCat] = useState<number | null>(null);

  /* Reorder mode (drag & drop categories + products) */
  const [reorderMode, setReorderMode] = useState(false);
  const [orderDirty, setOrderDirty]   = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [dragKind, setDragKind]       = useState<"cat" | "prod" | null>(null);
  const [dragId, setDragId]           = useState<number | null>(null);
  const [overId, setOverId]           = useState<number | null>(null);
  const [pointerXY, setPointerXY]     = useState<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect]       = useState<{ w: number; h: number } | null>(null);
  const dragRef = useRef<{
    kind: "cat" | "prod" | null;
    id: number | null;
    overId: number | null;
    startX: number;
    startY: number;
    activated: boolean;
    timer: number | null;
    cleanup: (() => void) | null;
  }>({ kind: null, id: null, overId: null, startX: 0, startY: 0, activated: false, timer: null, cleanup: null });
  const justDraggedRef  = useRef(false);
  const initialOrderRef = useRef<{ cats: number[] }>({ cats: [] });

  /* Cart — persistido en localStorage para sobrevivir recargas / cierre de sesión por token vencido */
  const [cart, setCart] = useState<CartItem[]>(() => readActiveCart()?.cart ?? []);
  const [orderNotes, setOrderNotes] = useState<string>(() => readActiveCart()?.orderNotes ?? "");
  const [editingItemNotesId, setEditingItemNotesId] = useState<number | null>(null);

  /* Idempotencia de cobro: mismo id se reusa entre reintentos del MISMO carrito;
     se regenera al cambiar el carrito (ver effect más abajo). Evita doble cobro. */
  const checkoutIdRef = useRef<string | null>(null);

  /* Open tickets — solo en memoria/localStorage, NO en DB */
  const [openTickets, setOpenTickets] = useState<OpenTicket[]>(() => {
    try {
      const saved = localStorage.getItem(OPEN_TICKETS_KEY);
      return saved ? JSON.parse(saved) as OpenTicket[] : [];
    } catch {
      return [];
    }
  });
  const [activeTicketId, setActiveTicketId] = useState<string | null>(() => readActiveCart()?.activeTicketId ?? null);

  /* Screen routing */
  const [screen, setScreen] = useState<Screen>("pos");
  const [completedTotal, setCompletedTotal] = useState(0);
  const [completedRef, setCompletedRef] = useState("");
  const [completedSaleId, setCompletedSaleId] = useState<number | null>(null);

  /* Print */
  const [printLoading, setPrintLoading] = useState(false);

  /* Paid orders history */
  const [paidOrders, setPaidOrders] = useState<PaidSale[]>([]);
  const [loadingPaid, setLoadingPaid] = useState(false);
  const [printingPaidId, setPrintingPaidId] = useState<number | null>(null);
  const [selectedPaidSale, setSelectedPaidSale] = useState<PaidSale | null>(null);
  const [paidSaleItems, setPaidSaleItems] = useState<SaleDetailItem[]>([]);
  const [loadingPaidDetail, setLoadingPaidDetail] = useState(false);

  /* Animations */
  const [flashId, setFlashId] = useState<number | null>(null);

  /* Pull-to-refresh on product grid */
  const { containerRef: gridRef, pulling: gridPulling, progress: pullProgress } =
    usePullToRefresh(
      () => { void loadProducts(); void loadCategories(); },
    );

  /* Qty editing BottomSheet */
  const [qtyItem, setQtyItem] = useState<CartItem | null>(null);
  const [qtyValue, setQtyValue] = useState("1");
  const [showQtySheet, setShowQtySheet] = useState(false);

  /* Pay BottomSheet */
  const [showPaySheet, setShowPaySheet]       = useState(false);
  const [payLoading, setPayLoading]           = useState(false);
  const [payNoTipLoading, setPayNoTipLoading] = useState(false);
  const [tipPercentage, setTipPercentage]     = useState(0);

  /* Touch keyboard setting */
  const [touchKeyboardEnabled, setTouchKeyboardEnabled] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(false);

  /* Nota activa: para el composer flotante encima del teclado táctil */
  const [activeNote, setActiveNote] = useState<{ kind: "item"; productId: number } | { kind: "order" } | null>(null);

  /* Order naming setting */
  const [orderAutoName, setOrderAutoName] = useState(true);
  const [quickOrdersEnabled, setQuickOrdersEnabled] = useState(false);
  const [quickNames, setQuickNames] = useState<string[]>([]);

  /* Name prompt sheet (manual naming mode) */
  const [showNameSheet, setShowNameSheet] = useState(false);
  const [pendingName, setPendingName] = useState("");

  /* Split bill sheet */
  const [showSplitSheet, setShowSplitSheet] = useState(false);

  /* ── Data loading ─────────────────────────────────────── */

  const loadProducts = useCallback(async (retries = 4) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const data = await apiRequest("/products") as Product[];
        if (mountedRef.current) { setProducts(data ?? []); setLoadingProds(false); }
        return;
      } catch {
        if (!mountedRef.current) return;
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 200 * Math.pow(2, attempt)));
        } else {
          setLoadingProds(false);
          show("Error cargando productos", { type: "error" });
        }
      }
    }
  }, [show]);

  const loadCategories = useCallback(async () => {
    try {
      const data = await apiRequest("/categories") as Category[];
      if (mountedRef.current) setCategories(data ?? []);
    } catch {
      /* non-critical */
    }
  }, []);

  const loadPaidOrders = useCallback(async () => {
    setLoadingPaid(true);
    try {
      const res = await apiRequest("/sales/paid") as { success?: boolean; data?: PaidSale[] };
      if (mountedRef.current) setPaidOrders(res?.data ?? []);
    } catch {
      /* non-critical */
    } finally {
      if (mountedRef.current) setLoadingPaid(false);
    }
  }, []);

  const applyStockRows = useCallback((data: ProductStock[]) => {
    setProducts(prev => {
      const stockMap = new Map(data.map(p => [p.id, p.stock]));
      let changed = false;
      const next = prev.map(p => {
        if (!stockMap.has(p.id)) return p;
        const newStock = stockMap.get(p.id);
        if (newStock !== p.stock) { changed = true; return { ...p, stock: newStock }; }
        return p;
      });
      return changed ? next : prev;
    });
  }, []);

  const refreshStock = useCallback(async () => {
    if (document.hidden) return;
    try {
      const data = await apiRequest("/products/stocks") as ProductStock[];
      if (!mountedRef.current) return;
      applyStockRows(data);
    } catch { /* silent */ }
  }, [applyStockRows]);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;
    let retryTimer: number | null = null;

    const parseEventBlock = (block: string) => {
      let event = "message";
      const dataLines: string[] = [];
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      }
      if (event !== "stock:update" && event !== "stock:snapshot") return;
      try {
        const payload = JSON.parse(dataLines.join("\n")) as { items?: ProductStock[] };
        if (Array.isArray(payload.items) && mountedRef.current) applyStockRows(payload.items);
      } catch {
        /* ignore malformed event */
      }
    };

    const scheduleReconnect = (delayMs: number) => {
      if (cancelled || retryTimer !== null) return;
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        void connect(Math.min(delayMs * 2, 30_000));
      }, delayMs);
    };

    const connect = async (nextDelayMs = 1_000): Promise<void> => {
      if (cancelled) return;
      controller = new AbortController();
      try {
        const base = await getBackendBaseUrl();
        const token = localStorage.getItem("token");
        if (!token) throw new Error("Token requerido");

        const response = await fetch(`${base}/api/products/stocks/stream`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (response.status === 401) {
          localStorage.removeItem("token");
          try { window.dispatchEvent(new CustomEvent("auth:unauthorized")); } catch {}
          return;
        }
        if (!response.ok || !response.body) throw new Error("Stock stream no disponible");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let separator = buffer.indexOf("\n\n");
          while (separator >= 0) {
            parseEventBlock(buffer.slice(0, separator));
            buffer = buffer.slice(separator + 2);
            separator = buffer.indexOf("\n\n");
          }
        }
      } catch {
        if (!cancelled) scheduleReconnect(nextDelayMs);
        return;
      }
      if (!cancelled) scheduleReconnect(nextDelayMs);
    };

    void connect();
    const fallbackId = window.setInterval(() => { void refreshStock(); }, STOCK_FALLBACK_REFRESH_MS);
    const onVisible = () => { if (!document.hidden) void refreshStock(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      controller?.abort();
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      window.clearInterval(fallbackId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [applyStockRows, refreshStock]);

  useEffect(() => {
    mountedRef.current = true;
    void loadProducts();
    void loadCategories();
    apiRequest("/settings/tip")
      .then((r: unknown) => {
        const pct = Number((r as Record<string, unknown>)?.value ?? 0);
        if (mountedRef.current) setTipPercentage(isFinite(pct) ? pct : 0);
      })
      .catch(() => {});
    apiRequest("/settings/touch-keyboard")
      .then((r: unknown) => {
        const data = (r as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
        if (mountedRef.current) setTouchKeyboardEnabled(data?.enabled === true);
      })
      .catch(() => {});
    apiRequest("/settings/order-naming")
      .then((r: unknown) => {
        const data = (r as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
        if (mountedRef.current) {
          setOrderAutoName(data?.autoName !== false);
          setQuickOrdersEnabled(Boolean(data?.quickOrdersEnabled));
          setQuickNames(Array.isArray(data?.quickNames) ? data.quickNames as string[] : []);
        }
      })
      .catch(() => {});
    return () => { mountedRef.current = false; };
  }, [loadProducts, loadCategories]);

  useEffect(() => {
    if (screen === "orders") {
      void loadPaidOrders();
    }
  }, [screen, loadPaidOrders]);

  /* Persistir openTickets en localStorage */
  useEffect(() => {
    try {
      localStorage.setItem(OPEN_TICKETS_KEY, JSON.stringify(openTickets));
    } catch {
      /* quota / private mode — ignorar */
    }
  }, [openTickets]);

  /* Persistir carrito activo — sobrevive recarga y cierre de sesión por token vencido */
  useEffect(() => {
    if (cart.length === 0) {
      try {
        localStorage.removeItem(ACTIVE_CART_KEY);
      } catch {
        /* quota / private mode — ignorar */
      }
      return;
    }

    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(ACTIVE_CART_KEY, JSON.stringify({ cart, orderNotes, activeTicketId }));
      } catch {
        /* quota / private mode — ignorar */
      }
    }, 250);
    return () => window.clearTimeout(id);
  }, [cart, orderNotes, activeTicketId]);

  /* Auto-guardar: crea un ticket nuevo si no hay uno activo; actualiza si ya existe.
     En modo manual muestra el sheet de nombre en lugar de auto-crear. */
  useEffect(() => {
    if (cart.length === 0) return;
    const id = window.setTimeout(() => {
      if (!activeTicketId) {
        if (!orderAutoName) {
          // Modo manual: pedir nombre al usuario (solo si el sheet no está ya abierto)
          setShowNameSheet(prev => prev ? prev : true);
        } else {
          // Modo automático: crear ticket con nombre generado
          const newId = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          setOpenTickets(prev => {
            const label = `Orden ${prev.length + 1}`;
            return [{ id: newId, label, cart, notes: orderNotes, createdAt: Date.now() }, ...prev];
          });
          setActiveTicketId(newId);
        }
      } else {
        setOpenTickets(prev => {
          const idx = prev.findIndex(t => t.id === activeTicketId);
          if (idx < 0) return prev;
          const existing = prev[idx];
          if (
            JSON.stringify(existing.cart) === JSON.stringify(cart) &&
            existing.notes === orderNotes
          ) return prev;
          const next = [...prev];
          next[idx] = { ...existing, cart, notes: orderNotes };
          return next;
        });
      }
    }, 300);
    return () => window.clearTimeout(id);
  }, [cart, orderNotes, activeTicketId, orderAutoName]);

  /* Cerrar sheet de nombre si el carrito queda vacío */
  useEffect(() => {
    if (cart.length === 0) {
      setShowNameSheet(false);
      setPendingName("");
    }
  }, [cart.length]);

  /* Cambió el contenido del carrito → es otra venta lógica → invalidar idempotencia */
  useEffect(() => {
    checkoutIdRef.current = null;
  }, [cart]);

  /* ── Filtered products ─────────────────────────────────── */

  const filteredProducts = useMemo(() => {
    let list = products;
    if (selectedCat !== null) list = list.filter(p => p.category_id === selectedCat);
    const q = deferredSearch.trim().toLowerCase();
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q));
    return list;
  }, [products, selectedCat, deferredSearch]);

  const catProductCount = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of products) {
      if (p.category_id != null) {
        map.set(p.category_id, (map.get(p.category_id) ?? 0) + 1);
      }
    }
    return map;
  }, [products]);

  const reservedProductQty = useMemo(() => {
    const map = new Map<number, number>();
    const add = (item: CartItem) => {
      map.set(item.productId, (map.get(item.productId) ?? 0) + item.quantity);
    };
    for (const ticket of openTickets) {
      if (ticket.id === activeTicketId) continue;
      ticket.cart.forEach(add);
    }
    cart.forEach(add);
    return map;
  }, [openTickets, activeTicketId, cart]);

  const visibleProducts = useMemo(() => {
    return filteredProducts.map(product => {
      if (product.stock == null) return product;
      const reserved = reservedProductQty.get(product.id) ?? 0;
      if (reserved <= 0) return product;
      return { ...product, stock: Math.max(0, Number(product.stock) - reserved) };
    });
  }, [filteredProducts, reservedProductQty]);

  // Reorden en vivo durante el drag (mueve el origen al destino visualmente)
  const displayCategories = useMemo(() => {
    if (!reorderMode || dragKind !== "cat" || dragId === null || overId === null || dragId === overId) return categories;
    const fi = categories.findIndex(c => c.id === dragId);
    const ti = categories.findIndex(c => c.id === overId);
    if (fi < 0 || ti < 0) return categories;
    const next = [...categories];
    const [m] = next.splice(fi, 1);
    next.splice(ti, 0, m);
    return next;
  }, [categories, reorderMode, dragKind, dragId, overId]);

  const displayVisibleProducts = useMemo(() => {
    if (!reorderMode || dragKind !== "prod" || dragId === null || overId === null || dragId === overId) return visibleProducts;
    const fi = visibleProducts.findIndex(p => p.id === dragId);
    const ti = visibleProducts.findIndex(p => p.id === overId);
    if (fi < 0 || ti < 0) return visibleProducts;
    const next = [...visibleProducts];
    const [m] = next.splice(fi, 1);
    next.splice(ti, 0, m);
    return next;
  }, [visibleProducts, reorderMode, dragKind, dragId, overId]);

  // Datos del item arrastrado para el ghost
  const dragGhostData = useMemo(() => {
    if (dragKind === "cat" && dragId !== null) {
      const cat = categories.find(c => c.id === dragId);
      if (cat) return { kind: "cat" as const, name: cat.name, count: catProductCount.get(cat.id) ?? 0 };
    }
    if (dragKind === "prod" && dragId !== null) {
      const prod = visibleProducts.find(p => p.id === dragId);
      if (prod) return { kind: "prod" as const, name: prod.name, price: toNum(prod.price), stock: prod.stock };
    }
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragKind, dragId, categories, visibleProducts]);

  /* ── Cart ──────────────────────────────────────────────── */

  const cartTotal = useMemo(
    () => money(cart.reduce((s, i) => s + money(i.price * i.quantity), 0)),
    [cart],
  );

  const addToCart = (product: Product) => {
    const price = toNum(product.price);
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id);
      if (existing) {
        return prev.map(i =>
          i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [...prev, { productId: product.id, name: product.name, price, quantity: 1, addedAt: Date.now() }];
    });
    setFlashId(product.id);
    navigator.vibrate?.(10);
    setTimeout(() => setFlashId(null), 400);
  };

  const increaseQty = (productId: number) =>
    setCart(prev =>
      prev.map(i => i.productId === productId ? { ...i, quantity: i.quantity + 1 } : i),
    );

  const decreaseQty = (productId: number) =>
    setCart(prev => {
      const item = prev.find(i => i.productId === productId);
      if (!item) return prev;
      if (item.quantity <= 1) return prev.filter(i => i.productId !== productId);
      return prev.map(i =>
        i.productId === productId ? { ...i, quantity: i.quantity - 1 } : i,
      );
    });

  const removeItem = (productId: number) => {
    const removed = cart.find(i => i.productId === productId);
    setCart(prev => prev.filter(i => i.productId !== productId));
    if (removed) {
      show(`"${removed.name}" eliminado`, {
        type: "info",
        action: {
          label: "Deshacer",
          onClick: () => setCart(prev => {
            if (prev.some(i => i.productId === productId)) return prev;
            return [...prev, removed];
          }),
        },
      });
    }
  };

  const setItemQty = (productId: number, qty: number) => {
    if (qty <= 0) {
      setCart(prev => prev.filter(i => i.productId !== productId));
      return;
    }
    setCart(prev =>
      prev.map(i => i.productId === productId ? { ...i, quantity: qty } : i),
    );
  };

  const setItemNotes = (productId: number, notes: string) => {
    setCart(prev =>
      prev.map(i =>
        i.productId === productId ? { ...i, notes: notes || undefined } : i
      )
    );
  };

  /* ── Reorder helpers ─────────────────────────────────── */

  const enterReorderMode = () => {
    // Snapshot del orden actual para poder cancelar
    initialOrderRef.current = {
      cats: categories.map(c => c.id),
    };
    setReorderMode(true);
    setOrderDirty(false);
  };

  const cancelReorder = () => {
    const initialCatIds = initialOrderRef.current.cats;
    if (initialCatIds.length > 0) {
      setCategories(prev => {
        const map = new Map(prev.map(c => [c.id, c]));
        return initialCatIds.map(id => map.get(id)).filter(Boolean) as Category[];
      });
    }
    setReorderMode(false);
    setOrderDirty(false);
    cleanupDrag();
  };

  const saveOrder = async () => {
    setSavingOrder(true);
    try {
      // Guardar orden de categorías
      await apiRequest("/categories/reorder", {
        method: "PATCH",
        body: JSON.stringify({
          categories: categories.map((c, i) => ({ id: c.id, order: i })),
        }),
      });
      // Guardar orden de productos de la categoría visible
      if (selectedCat !== null && products.length > 0) {
        const catProducts = products.filter(p => p.category_id === selectedCat);
        if (catProducts.length > 0) {
          await apiRequest("/products/reorder", {
            method: "PATCH",
            body: JSON.stringify({
              products: catProducts.map((p, i) => ({ id: p.id, order: i })),
            }),
          });
        }
      }
      show("Orden guardado", { type: "success" });
      setReorderMode(false);
      setOrderDirty(false);
    } catch (err) {
      show(err instanceof Error ? err.message : "Error al guardar orden", { type: "error" });
    } finally {
      setSavingOrder(false);
    }
  };

  /* Drag-and-drop con long-press (touch-friendly, global listeners) */
  const commitReorder = (kind: "cat" | "prod", fromId: number, toId: number) => {
    if (kind === "cat") {
      setCategories(prev => {
        const fi = prev.findIndex(c => c.id === fromId);
        const ti = prev.findIndex(c => c.id === toId);
        if (fi < 0 || ti < 0) return prev;
        const next = [...prev];
        const [m] = next.splice(fi, 1);
        next.splice(ti, 0, m);
        return next;
      });
    } else {
      // Para productos: el index dentro de visibleProducts puede no coincidir con el index
      // dentro de `products` (filtros, búsqueda). Persistir basándonos en visibleProducts.
      const vi_from = visibleProducts.findIndex(p => p.id === fromId);
      const vi_to   = visibleProducts.findIndex(p => p.id === toId);
      if (vi_from < 0 || vi_to < 0) return;
      const reorderedVisible = [...visibleProducts];
      const [m] = reorderedVisible.splice(vi_from, 1);
      reorderedVisible.splice(vi_to, 0, m);
      // Reconstruir `products`: para cada id en visibleProducts (en su nuevo orden),
      // buscar el producto en products (puede haber items fuera del filtro que conservamos al final).
      setProducts(prev => {
        const visibleIds = new Set(reorderedVisible.map(p => p.id));
        const visMap = new Map(prev.map(p => [p.id, p]));
        const reorderedFromProducts = reorderedVisible
          .map(rp => visMap.get(rp.id))
          .filter(Boolean) as Product[];
        const rest = prev.filter(p => !visibleIds.has(p.id));
        return [...reorderedFromProducts, ...rest];
      });
    }
    setOrderDirty(true);
    navigator.vibrate?.(15);
  };

  const cleanupDrag = () => {
    const d = dragRef.current;
    if (d.timer) window.clearTimeout(d.timer);
    if (d.cleanup) d.cleanup();
    dragRef.current = { kind: null, id: null, overId: null, startX: 0, startY: 0, activated: false, timer: null, cleanup: null };
    setDragKind(null);
    setDragId(null);
    setOverId(null);
    setPointerXY(null);
    setDragRect(null);
  };

  const onItemPointerDown = (kind: "cat" | "prod", id: number) => (e: React.PointerEvent) => {
    if (!reorderMode) return;
    // Solo botón izquierdo / dedo
    if (e.button !== undefined && e.button !== 0) return;

    cleanupDrag();

    const startX = e.clientX;
    const startY = e.clientY;
    const isTouch = e.pointerType === "touch";
    // Mouse / pen: activación inmediata. Touch: long-press 220ms.
    const activationDelay = isTouch ? 220 : 0;
    // Medir el rect del elemento origen para el ghost
    const srcEl = e.currentTarget as HTMLElement;
    const srcRect = srcEl.getBoundingClientRect();

    const onDocMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d.activated) {
        // Cancelar si el usuario mueve mucho antes del long-press (scroll/tap)
        const dx = ev.clientX - d.startX;
        const dy = ev.clientY - d.startY;
        if (Math.hypot(dx, dy) > 14) {
          cleanupDrag();
        }
        return;
      }
      // Drag activo → actualizar overId, posición del ghost y bloquear scroll
      ev.preventDefault();
      setPointerXY({ x: ev.clientX, y: ev.clientY });
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      if (!el) return;
      const card = el.closest<HTMLElement>(kind === "cat" ? "[data-cat]" : "[data-prod]");
      if (!card) return;
      const attr = card.getAttribute(kind === "cat" ? "data-cat" : "data-prod");
      if (!attr || attr === "all") return;
      const newOver = Number(attr);
      if (Number.isFinite(newOver) && newOver !== d.overId) {
        d.overId = newOver;
        setOverId(newOver);
      }
    };

    const onDocUp = () => {
      const d = dragRef.current;
      if (d.activated && d.id !== null && d.overId !== null && d.id !== d.overId) {
        commitReorder(kind, d.id, d.overId);
        justDraggedRef.current = true;
        window.setTimeout(() => { justDraggedRef.current = false; }, 350);
      }
      cleanupDrag();
    };

    const cleanup = () => {
      document.removeEventListener("pointermove", onDocMove);
      document.removeEventListener("pointerup", onDocUp);
      document.removeEventListener("pointercancel", onDocUp);
    };

    dragRef.current = {
      kind, id, overId: id,
      startX, startY,
      activated: false,
      timer: null,
      cleanup,
    };

    const activate = () => {
      const d = dragRef.current;
      if (d.id !== id) return;
      d.activated = true;
      setDragKind(kind);
      setDragId(id);
      setOverId(id);
      setPointerXY({ x: startX, y: startY });
      setDragRect({ w: srcRect.width, h: srcRect.height });
      if (isTouch) navigator.vibrate?.(20);
    };

    if (activationDelay === 0) {
      // Mouse: activar de inmediato pero evitar selección de texto
      e.preventDefault();
      activate();
    } else {
      dragRef.current.timer = window.setTimeout(activate, activationDelay);
    }

    document.addEventListener("pointermove", onDocMove, { passive: false });
    document.addEventListener("pointerup", onDocUp);
    document.addEventListener("pointercancel", onDocUp);
  };

  const handleCatSelect = useCallback((id: number | null) => {
    if (reorderMode) return; // bloquear selección normal
    if (id === selectedCat) return;
    setSelectedCat(id);
    navigator.vibrate?.(8);
    requestAnimationFrame(() => {
      const chip = catsRef.current?.querySelector(
        `[data-cat="${id ?? "all"}"]`
      ) as HTMLElement | null;
      chip?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    });
  }, [selectedCat]);

  const clearCart = () => {
    setCart([]);
    setOrderNotes("");
    setEditingItemNotesId(null);
    setActiveTicketId(null);
  };

  const loadTicket = (ticket: OpenTicket) => {
    setCart(ticket.cart);
    setOrderNotes(ticket.notes);
    setActiveTicketId(ticket.id);
    setEditingItemNotesId(null);
    setScreen("pos");
  };

  const deleteTicket = (id: string) => {
    setOpenTickets(prev => prev.filter(t => t.id !== id));
    if (activeTicketId === id) setActiveTicketId(null);
  };

  /* ── Actions ──────────────────────────────────────────── */

  const handleNewOrder = () => {
    clearCart();
    setScreen("pos");
  };

  const handleCreateNamedOrder = (nameOverride?: string) => {
    const newId = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const label = (nameOverride ?? pendingName).trim() || `Orden ${openTickets.length + 1}`;
    setOpenTickets(prev => [{ id: newId, label, cart, notes: orderNotes, createdAt: Date.now() }, ...prev]);
    setActiveTicketId(newId);
    setShowNameSheet(false);
    setPendingName("");
  };

  const handlePay = async ({ noTip = false }: { noTip?: boolean } = {}) => {
    if (cart.length === 0) return;
    // Idempotencia: un id por carrito, reusado entre reintentos (lo limpia el effect al cambiar el carrito).
    if (!checkoutIdRef.current) {
      checkoutIdRef.current = crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    noTip ? setPayNoTipLoading(true) : setPayLoading(true);
    try {
      const activeTicket = activeTicketId
        ? openTickets.find(t => t.id === activeTicketId)
        : null;
      const body: Record<string, unknown> = {
        // El precio NO se envía: el backend lo toma de la DB (evita manipulación).
        items: cart.map(i => ({ product_id: i.productId, quantity: i.quantity, notes: i.notes || null })),
        reference: activeTicket?.label || undefined,
        notes: orderNotes || null,
        client_request_id: checkoutIdRef.current,
      };
      if (noTip) {
        body.tip_amount     = 0;
        body.tip_percentage = 0;
      }
      const result = await apiRequest("/sales", { method: "POST", body: JSON.stringify(body) }) as { id?: number; total?: number; tip_amount?: number };

      if (mountedRef.current) {
        checkoutIdRef.current = null; // cobro confirmado → liberar id
        setCompletedTotal(money(Number(result?.total ?? cartTotal) + Number(result?.tip_amount ?? 0)));
        setCompletedRef(activeTicket?.label || "Venta");
        setCompletedSaleId(result?.id ?? null);
        // Quitar el ticket de la memoria si estaba ahí
        if (activeTicketId) {
          setOpenTickets(prev => prev.filter(t => t.id !== activeTicketId));
        }
        clearCart();
        setShowPaySheet(false);
        navigator.vibrate?.([20, 60, 20, 60, 40]);
        void refreshStock();
        setScreen("completed");
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        show(err instanceof Error ? err.message : "Error al cobrar", { type: "error" });
      }
    } finally {
      if (mountedRef.current) {
        setPayLoading(false);
        setPayNoTipLoading(false);
      }
    }
  };

  const handlePrint = async () => {
    setPrintLoading(true);
    try {
      await apiRequest("/print/receipt", {
        method: "POST",
        body: JSON.stringify({ sale_id: completedSaleId }),
        timeoutMs: 10_000,
      });
      if (mountedRef.current) show("Ticket enviado a la impresora", { type: "success" });
    } catch {
      if (mountedRef.current) show("Impresora no disponible — revisa configuración", { type: "error" });
    } finally {
      if (mountedRef.current) setPrintLoading(false);
    }
  };

  /* Imprime a cocina/barra desde un ticket en memoria (sin guardar en DB) */
  const sendKitchenTicket = async (
    targets: ('kitchen' | 'bar')[],
    items: CartItem[],
    notes: string,
    reference?: string,
  ) => {
    if (items.length === 0) return;
    setPrintLoading(true);
    try {
      const response = await apiRequest("/print/kitchen-ticket", {
        method: "POST",
        body: JSON.stringify({
          items: items.map(i => ({
            product_id: i.productId,
            name: i.name,
            quantity: i.quantity,
            notes: i.notes || null,
          })),
          reference: reference || undefined,
          notes: notes || null,
          targets,
        }),
        timeoutMs: 5_000,
      }) as { success?: boolean; message?: string };

      if (response?.success) {
        const label = targets.length === 2 ? "Ticket enviado a cocina y barra"
          : targets[0] === "kitchen"       ? "Ticket enviado a cocina"
          :                                  "Ticket enviado a barra";
        show(label, { type: "success" });
      } else {
        throw new Error(response?.message || "Error desconocido");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo enviar el ticket";
      if (mountedRef.current) show(msg, { type: "error" });
    } finally {
      if (mountedRef.current) setPrintLoading(false);
    }
  };

  const printPaidReceipt = async (saleId: number) => {
    setPrintingPaidId(saleId);
    try {
      await apiRequest("/print/receipt", {
        method: "POST",
        body: JSON.stringify({ sale_id: saleId }),
        timeoutMs: 10_000,
      });
      if (mountedRef.current) show("Ticket enviado a la impresora", { type: "success" });
    } catch {
      if (mountedRef.current) show("Impresora no disponible — revisa configuración", { type: "error" });
    } finally {
      if (mountedRef.current) setPrintingPaidId(null);
    }
  };

  const openPaidSaleDetail = async (sale: PaidSale) => {
    setSelectedPaidSale(sale);
    setPaidSaleItems([]);
    setLoadingPaidDetail(true);
    try {
      const res = await apiRequest(`/sales/${sale.id}`) as { success?: boolean; data?: { items?: SaleDetailItem[]; [k: string]: unknown } };
      if (mountedRef.current) setPaidSaleItems(res?.data?.items ?? []);
    } catch {
      /* mostrar sin items si falla */
    } finally {
      if (mountedRef.current) setLoadingPaidDetail(false);
    }
  };

  /* ── Role check ───────────────────────────────────────── */
  const canAdmin = role === "admin" || role === "supervisor";

  /* ============================================================
     SCREEN: Completed sale
  ============================================================ */
  if (screen === "completed") {
    return (
      <div className="ps-completed">
        <div className="ps-completed-check">
          <CheckIcon />
        </div>
        <h1 className="ps-completed-title">¡Cobrado!</h1>
        <p className="ps-completed-amount">{fmt(completedTotal)}</p>
        {completedRef && <p className="ps-completed-ref">{completedRef}</p>}
        <Button variant="primary" size="xl" onClick={handleNewOrder}>
          Nueva venta
        </Button>
        {completedSaleId != null && (
          <Button
            variant="secondary"
            size="lg"
            loading={printLoading}
            onClick={() => void handlePrint()}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <PrintIcon /><span>Imprimir ticket</span>
            </span>
          </Button>
        )}
        <Button variant="ghost" size="md" onClick={() => { handleNewOrder(); setScreen("orders"); }}>
          Ver órdenes
        </Button>
      </div>
    );
  }

  /* ============================================================
     SCREEN: Orders history (solo ventas cobradas)
  ============================================================ */
  if (screen === "orders") {
    return (
      <>
      <div className="ps-orders-overlay">
        <div className="ps-orders-header">
          <button className="ps-icon-btn" onClick={() => setScreen("pos")} aria-label="Volver al POS">
            <BackIcon />
          </button>
          <h1 className="ps-orders-title">Órdenes</h1>
          <Button variant="primary" size="md" onClick={handleNewOrder}>
            + Nueva venta
          </Button>
        </div>

        <div className="ps-orders-scroll">
          {/* ── Abiertas (memoria local) ── */}
          {openTickets.length > 0 && (
            <>
              <div className="ps-orders-section-title">
                Abiertas <span className="ps-orders-count">{openTickets.length}</span>
              </div>
              <div className="ps-orders-list">
                {openTickets.map(ticket => {
                  const ticketTotal = ticket.cart.reduce((s, i) => s + i.price * i.quantity, 0);
                  const itemsCount = ticket.cart.reduce((s, i) => s + i.quantity, 0);
                  return (
                    <div key={ticket.id} className="ps-order-card" onClick={() => loadTicket(ticket)} style={{ cursor: "pointer" }}>
                      <div className="ps-order-info">
                        <div className="ps-order-ref">{ticket.label}</div>
                        <div className="ps-order-meta">
                          {itemsCount} ítems · {new Date(ticket.createdAt).toLocaleTimeString("es-GT", { timeStyle: "short" })}
                        </div>
                      </div>
                      <div className="ps-order-card-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="ps-order-action-btn ps-order-action-btn--kitchen"
                          onClick={(e) => { e.stopPropagation(); void sendKitchenTicket(['kitchen'], ticket.cart, ticket.notes, ticket.label); }}
                          disabled={printLoading}
                        >
                          Cocina
                        </button>
                        <button
                          className="ps-order-action-btn ps-order-action-btn--bar"
                          onClick={(e) => { e.stopPropagation(); void sendKitchenTicket(['bar'], ticket.cart, ticket.notes, ticket.label); }}
                          disabled={printLoading}
                        >
                          Barra
                        </button>
                        <button
                          className="ps-order-action-btn ps-order-action-btn--both"
                          onClick={(e) => { e.stopPropagation(); void sendKitchenTicket(['kitchen', 'bar'], ticket.cart, ticket.notes, ticket.label); }}
                          disabled={printLoading}
                        >
                          Ambos
                        </button>
                        <button
                          className="ps-order-action-btn ps-order-action-btn--delete"
                          onClick={(e) => { e.stopPropagation(); deleteTicket(ticket.id); }}
                        >
                          Eliminar
                        </button>
                        <span className="ps-order-total">{fmt(ticketTotal)}</span>
                        <span className="ps-order-chevron"><ChevronRightIcon /></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── Separador ── */}
          {openTickets.length > 0 && paidOrders.length > 0 && (
            <div className="ps-orders-divider" />
          )}

          {/* ── Cobradas ── */}
          {loadingPaid ? (
            <div className="ps-center" style={{ minHeight: 80 }}><Spinner size="md" /></div>
          ) : paidOrders.length > 0 ? (
            <>
              <div className="ps-orders-section-title">
                Cobradas <span className="ps-orders-count ps-orders-count--paid">{paidOrders.length}</span>
              </div>
              <div className="ps-paid-list">
                {paidOrders.map(sale => (
                  <div
                    key={sale.id}
                    className="ps-paid-row"
                    onClick={() => void openPaidSaleDetail(sale)}
                  >
                    <div className="ps-paid-row-info">
                      <span className="ps-paid-row-ref">
                        {sale.reference || `#${sale.monthly_number ?? sale.id}`}
                      </span>
                      <span className="ps-paid-row-meta">
                        {sale.items_count != null ? `${sale.items_count} ítems · ` : ""}
                        {new Date(sale.created_at).toLocaleTimeString("es-GT", { timeStyle: "short" })}
                      </span>
                    </div>
                    <span className="ps-paid-row-total">{fmt(toNum(sale.total))}</span>
                    <button
                      className="ps-paid-print-btn"
                      title="Imprimir ticket"
                      disabled={printingPaidId === sale.id}
                      onClick={(e) => { e.stopPropagation(); void printPaidReceipt(sale.id); }}
                    >
                      {printingPaidId === sale.id ? <Spinner size="sm" /> : <PrintIcon />}
                    </button>
                    <span className="ps-paid-row-chevron"><ChevronRightIcon /></span>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {/* ── Estado vacío total ── */}
          {!loadingPaid && openTickets.length === 0 && paidOrders.length === 0 && (
            <div className="ps-center" style={{ flexDirection: "column", gap: 12 }}>
              <span style={{ fontSize: 48, lineHeight: 1 }}>📋</span>
              <p style={{ fontWeight: 700, color: "var(--text-3)" }}>No hay órdenes</p>
            </div>
          )}
        </div>
      </div>

      {selectedPaidSale && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100,
          }}
          onClick={() => setSelectedPaidSale(null)}
        >
          <div
            className="ps-paid-detail"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ps-paid-detail-header">
              <div>
                <div className="ps-paid-detail-title">
                  {selectedPaidSale.reference || `Venta #${selectedPaidSale.monthly_number ?? selectedPaidSale.id}`}
                </div>
                <div className="ps-paid-detail-time">
                  {new Date(selectedPaidSale.created_at).toLocaleString("es-GT", { dateStyle: "short", timeStyle: "short" })}
                </div>
              </div>
              <button
                className="ps-icon-btn"
                onClick={() => setSelectedPaidSale(null)}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="ps-paid-detail-items">
              {loadingPaidDetail ? (
                <div className="ps-center" style={{ minHeight: 80 }}><Spinner size="md" /></div>
              ) : paidSaleItems.length === 0 ? (
                <p style={{ color: "var(--text-3)", textAlign: "center", padding: "20px 0" }}>Sin detalle de ítems</p>
              ) : (
                paidSaleItems.map(item => (
                  <div key={item.id} className="ps-paid-detail-item">
                    <span className="ps-paid-detail-item-qty">{item.quantity}×</span>
                    <span className="ps-paid-detail-item-name">{item.name}</span>
                    <span className="ps-paid-detail-item-price">{fmt(toNum(item.price) * item.quantity)}</span>
                  </div>
                ))
              )}
            </div>

            <div className="ps-paid-detail-footer">
              <div className="ps-paid-detail-total">
                <span>Total</span>
                <span>{fmt(toNum(selectedPaidSale.total))}</span>
              </div>
              {toNum(selectedPaidSale.tip_amount) > 0 && (
                <div className="ps-paid-detail-tip">
                  <span>Propina incluida</span>
                  <span>{fmt(toNum(selectedPaidSale.tip_amount))}</span>
                </div>
              )}
              <button
                className="ps-paid-detail-print-btn"
                disabled={printingPaidId === selectedPaidSale.id}
                onClick={() => void printPaidReceipt(selectedPaidSale.id)}
              >
                {printingPaidId === selectedPaidSale.id
                  ? <Spinner size="sm" />
                  : <><PrintIcon /><span>Imprimir ticket</span></>
                }
              </button>
            </div>
          </div>
        </div>
      )}
      </>
    );
  }

  /* ============================================================
     SCREEN: Main POS (pos)
  ============================================================ */

  return (
    <>
      <div className="ps-layout">

        {/* ── Sidebar ───────────────────────────────────── */}
        <aside className="ps-sidebar">
          <div className="ps-sidebar-logo">
            <img src={`${import.meta.env.BASE_URL}logo.jpeg`} alt="Tecpancito" />
          </div>

          <button
            className="ps-sidebar-btn ps-sidebar-btn--new-order"
            onClick={handleNewOrder}
            aria-label="Nueva orden"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            <span>Nueva orden</span>
          </button>

          <button
            className="ps-sidebar-btn"
            onClick={() => setScreen("orders")}
            aria-label="Órdenes"
            style={{ position: "relative" }}
          >
            <ListIcon />
            <span>Órdenes</span>
            {openTickets.length > 0 && (
              <span style={{
                position: "absolute",
                top: 6,
                right: 8,
                background: "var(--fx-yellow)",
                color: "var(--fx-coal)",
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 800,
                padding: "1px 6px",
                minWidth: 16,
                textAlign: "center",
              }}>{openTickets.length}</span>
            )}
          </button>

          <div className="ps-sidebar-spacer" />

          {canAdmin && !reorderMode && (
            <button
              className="ps-sidebar-btn"
              onClick={enterReorderMode}
              aria-label="Ordenar categorías y productos"
            >
              <SortIcon />
              <span>Ordenar</span>
            </button>
          )}

          {canAdmin && (
            <button
              className="ps-sidebar-btn"
              onClick={onGoToAdmin}
              aria-label="Administración"
            >
              <AdminIcon />
              <span>Admin</span>
            </button>
          )}

          <button
            className="ps-sidebar-btn ps-sidebar-btn--danger"
            onClick={onLogout}
            aria-label="Cerrar sesión"
          >
            <LogoutIcon />
            <span>Salir</span>
          </button>
        </aside>

        {/* ── Reorder drag ghost ────────────────────────── */}
        {dragGhostData && pointerXY && dragRect && (
          <div
            aria-hidden
            style={{
              position: "fixed",
              left: pointerXY.x,
              top:  pointerXY.y,
              width:  dragRect.w,
              height: dragRect.h,
              transform: "translate(-50%, -50%) rotate(-2deg) scale(1.04)",
              pointerEvents: "none",
              zIndex: 9999,
              background: "var(--bg-elev, #F8F2DD)",
              border: "2px solid var(--accent)",
              borderRadius: dragGhostData.kind === "cat" ? "var(--radius-pill)" : "var(--radius-md)",
              boxShadow: "0 12px 30px rgba(0,0,0,0.25)",
              display: "flex",
              flexDirection: dragGhostData.kind === "cat" ? "row" : "column",
              alignItems: dragGhostData.kind === "cat" ? "center" : "flex-start",
              justifyContent: dragGhostData.kind === "cat" ? "center" : "flex-start",
              gap: dragGhostData.kind === "cat" ? 6 : 4,
              padding: dragGhostData.kind === "cat" ? "8px 14px" : "10px 12px",
              color: "var(--text-1)",
              opacity: 0.95,
              transition: "transform 60ms ease-out",
            }}
          >
            {dragGhostData.kind === "cat" ? (
              <>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{dragGhostData.name}</span>
                {dragGhostData.count > 0 && (
                  <span className="ps-cat-count">{dragGhostData.count}</span>
                )}
              </>
            ) : (
              <>
                <span className="ps-product-name">{dragGhostData.name}</span>
                <span className="ps-product-price">{fmt(dragGhostData.price)}</span>
                {dragGhostData.stock != null && (
                  <span className="ps-product-stock">Disponible: {dragGhostData.stock}</span>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Reorder mode floating bar ─────────────────── */}
        {reorderMode && (
          <div style={{
            position: "fixed",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            background: "var(--bg-elev)",
            border: "1.5px solid var(--accent)",
            borderRadius: 999,
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>
              Modo ordenar — mantén presionado y arrastra
            </span>
            <button
              onClick={cancelReorder}
              disabled={savingOrder}
              style={{
                padding: "7px 14px",
                borderRadius: 999,
                border: "1px solid var(--border-strong)",
                background: "var(--bg-deeper)",
                color: "var(--text-2)",
                fontWeight: 700, fontSize: 13,
                cursor: savingOrder ? "not-allowed" : "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              onClick={() => void saveOrder()}
              disabled={savingOrder || !orderDirty}
              style={{
                padding: "7px 16px",
                borderRadius: 999,
                border: "1px solid var(--accent-deep)",
                background: orderDirty
                  ? "linear-gradient(160deg, #F5C944, var(--accent) 55%, var(--accent-deep))"
                  : "var(--bg-deeper)",
                color: orderDirty ? "var(--accent-ink, #2B1608)" : "var(--text-3)",
                fontWeight: 800, fontSize: 13,
                cursor: (savingOrder || !orderDirty) ? "not-allowed" : "pointer",
                opacity: savingOrder ? 0.6 : 1,
              }}
            >
              {savingOrder ? "Guardando…" : "Guardar orden"}
            </button>
          </div>
        )}

        {/* ── Products ──────────────────────────────────── */}
        <main className="ps-products">

          {/* Top bar */}
          <div className="ps-topbar">
            <div className="ps-search-wrap">
              <span className="ps-search-icon"><SearchIcon /></span>
              <input
                className="ps-search"
                placeholder="Buscar producto..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onFocus={() => { if (touchKeyboardEnabled) setShowKeyboard(true); }}
                type="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              {search && (
                <button
                  className="ps-search-clear"
                  onClick={() => setSearch("")}
                  onPointerDown={e => e.preventDefault()}
                  aria-label="Borrar búsqueda"
                >
                  <XIcon />
                </button>
              )}
            </div>
          </div>

          {/* Category chips */}
          <div className="ps-cats-wrap" style={dragKind ? { touchAction: "none" } : undefined}>
            <button
              className={`ps-cat-chip ps-cat-chip--todas${selectedCat === null ? " ps-cat-chip--active" : ""}`}
              onClick={() => handleCatSelect(null)}
              role="tab"
              aria-pressed={selectedCat === null}
              data-cat="all"
            >
              <GridIcon />
              Todas
              <span className="ps-cat-count">{products.length}</span>
            </button>
            <div className="ps-cats" ref={catsRef} role="tablist" aria-label="Filtrar por categoría">
              {displayCategories.map(cat => {
                const isDragging = dragKind === "cat" && dragId === cat.id;
                return (
                  <button
                    key={cat.id}
                    className={`ps-cat-chip${selectedCat === cat.id && !reorderMode ? " ps-cat-chip--active" : ""}`}
                    onClick={() => { if (justDraggedRef.current) return; handleCatSelect(cat.id); }}
                    onPointerDown={onItemPointerDown("cat", cat.id)}
                    onContextMenu={reorderMode ? (e) => e.preventDefault() : undefined}
                    draggable={false}
                    role="tab"
                    aria-pressed={selectedCat === cat.id}
                    data-cat={cat.id}
                    style={reorderMode ? {
                      cursor: isDragging ? "grabbing" : "grab",
                      visibility: isDragging ? "hidden" : "visible",
                      touchAction: "none",
                      userSelect: "none",
                      WebkitUserSelect: "none",
                      WebkitTouchCallout: "none",
                      transition: "transform 220ms cubic-bezier(.2,.7,.2,1)",
                    } : undefined}
                  >
                    {cat.name}
                    {(catProductCount.get(cat.id) ?? 0) > 0 && (
                      <span className="ps-cat-count">{catProductCount.get(cat.id)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Product grid */}
          <div className="ps-grid-wrap" ref={gridRef} style={dragKind ? { touchAction: "none", overflow: "hidden" } : undefined}>
            {gridPulling && (
              <div className="ps-ptr-indicator" style={{ "--ptr-progress": pullProgress } as React.CSSProperties}>
                <Spinner size="sm" />
                <span>{pullProgress >= 1 ? "Soltar para actualizar" : "Desliza para actualizar"}</span>
              </div>
            )}
            {loadingProds ? (
              <div className="ps-skeleton-grid">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="ps-product-skeleton" />
                ))}
              </div>
            ) : visibleProducts.length === 0 ? (
              <div className="ps-no-results">
                <p>Sin resultados</p>
                {search && <p>Intenta con otro término de búsqueda</p>}
              </div>
            ) : (
              <div className="ps-grid">
                {displayVisibleProducts.map(product => {
                  const isDragging = dragKind === "prod" && dragId === product.id;
                  return (
                    <div
                      key={product.id}
                      className={`ps-product-card${flashId === product.id ? " ps-product-card--added" : ""}`}
                      onClick={() => { if (reorderMode || justDraggedRef.current) return; addToCart(product); }}
                      onPointerDown={onItemPointerDown("prod", product.id)}
                      onContextMenu={reorderMode ? (e) => e.preventDefault() : undefined}
                      draggable={false}
                      data-prod={product.id}
                      style={reorderMode ? {
                        cursor: isDragging ? "grabbing" : "grab",
                        visibility: isDragging ? "hidden" : "visible",
                        touchAction: "none",
                        userSelect: "none",
                        WebkitUserSelect: "none",
                        WebkitTouchCallout: "none",
                        transition: "transform 220ms cubic-bezier(.2,.7,.2,1)",
                      } : undefined}
                    >
                      <span className="ps-product-name">{product.name}</span>
                      <span className="ps-product-price">{fmt(toNum(product.price))}</span>
                      {product.stock != null && (
                        <span className="ps-product-stock">Disponible: {product.stock}</span>
                      )}
                      {!reorderMode && (
                        <div className="ps-product-add-badge" aria-hidden="true">+</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>

        {/* ── Ticket ────────────────────────────────────── */}
        <section className="ps-ticket" aria-label="Ticket actual">

          <div className="ps-ticket-header">
            <div className="ps-ticket-label">Ticket actual</div>
            <div className="ps-ticket-ref">
              {activeTicketId
                ? (openTickets.find(t => t.id === activeTicketId)?.label ?? "Nueva venta")
                : "Nueva venta"}
            </div>
          </div>

          {cart.length === 0 ? (
            <div className="ps-ticket-empty">
              <div className="ps-ticket-empty-icon"><EmptyTicketIcon /></div>
              <p>Toca un producto para agregarlo al ticket</p>
            </div>
          ) : (
            <div className="ps-ticket-items">
              {cart.map(item => (
                <div key={item.productId} className="ps-ticket-item">
                    <div className="ps-ticket-item-info">
                      <div className="ps-ticket-item-name">{item.name}</div>
                      <div className="ps-ticket-item-price">
                        {fmt(item.price)} c/u
                        {item.addedAt && (
                          <span style={{ marginLeft: 6, fontSize: 11, color: "var(--text-3)", fontWeight: 400 }}>
                            {new Date(item.addedAt).toLocaleTimeString("es-GT", { timeStyle: "short" })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="ps-ticket-qty-row">
                      <button
                        className="ps-ticket-qty-btn"
                        onClick={() => decreaseQty(item.productId)}
                        aria-label="Quitar uno"
                      >
                        −
                      </button>
                      <button
                        className="ps-ticket-qty"
                        onClick={() => {
                          setQtyItem(item);
                          setQtyValue(String(item.quantity));
                          setShowQtySheet(true);
                        }}
                        aria-label={`Cantidad: ${item.quantity}. Toca para editar`}
                      >
                        {item.quantity}
                      </button>
                      <button
                        className="ps-ticket-qty-btn"
                        onClick={() => increaseQty(item.productId)}
                        aria-label="Agregar uno"
                      >
                        +
                      </button>
                      <button
                        className="ps-ticket-qty-btn"
                        title={item.notes ? `Nota: ${item.notes}` : "Agregar nota"}
                        onClick={() => setEditingItemNotesId(editingItemNotesId === item.productId ? null : item.productId)}
                        style={{
                          background: item.notes ? "var(--fx-yellow)" : "inherit",
                          color: item.notes ? "var(--fx-coal)" : "inherit",
                        }}
                        aria-label="Nota del ítem"
                      >
                        📝
                      </button>
                      <button
                        className="ps-ticket-remove-btn"
                        onClick={() => removeItem(item.productId)}
                        aria-label="Eliminar artículo"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                    {editingItemNotesId === item.productId && (
                      <div style={{ padding: "6px 0", marginTop: 6, borderTop: "1px solid var(--border)" }}>
                        <input
                          type="text"
                          autoFocus
                          placeholder="Ej: sin cebolla..."
                          value={item.notes || ""}
                          onChange={(e) => setItemNotes(item.productId, e.target.value)}
                          onFocus={() => {
                            setActiveNote({ kind: "item", productId: item.productId });
                            if (touchKeyboardEnabled) setShowKeyboard(true);
                          }}
                          onBlur={() => { setEditingItemNotesId(null); setActiveNote(null); }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "Escape") {
                              setEditingItemNotesId(null);
                            }
                          }}
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            border: "1px solid var(--fx-yellow)",
                            borderRadius: 4,
                            fontSize: 13,
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                    )}
                    {item.notes && editingItemNotesId !== item.productId && (
                      <div style={{
                        fontSize: 11,
                        color: "var(--fx-coal)",
                        background: "var(--primary-bg)",
                        padding: "2px 8px",
                        marginTop: 4,
                        borderRadius: 3,
                      }}>
                        📝 {item.notes}
                      </div>
                    )}
                </div>
              ))}
            </div>
          )}

          <div className="ps-ticket-footer">
            <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", marginBottom: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)", display: "block", marginBottom: 4 }}>
                📋 Nota general:
              </label>
              <textarea
                placeholder="Ej: mesa 5, alérgico..."
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                onFocus={() => {
                  setActiveNote({ kind: "order" });
                  if (touchKeyboardEnabled) setShowKeyboard(true);
                }}
                onBlur={() => setActiveNote(null)}
                rows={2}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  fontSize: 13,
                  fontFamily: "inherit",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div className="ps-ticket-total">
              <span className="ps-ticket-total-label">Total</span>
              <span className="ps-ticket-total-amount">{fmt(cartTotal)}</span>
            </div>

            <Button
              variant="secondary"
              size="lg"
              fullWidth
              disabled={cart.length === 0}
              onClick={() => { if (cart.length > 0) setShowSplitSheet(true); }}
            >
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 3h5v5"/><path d="M8 3H3v5"/>
                  <path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"/>
                  <path d="m15 9 6-6"/>
                </svg>
                Dividir cuenta
              </span>
            </Button>

            <Button
              variant="primary"
              size="xl"
              fullWidth
              disabled={cart.length === 0}
              onClick={() => {
                if (cart.length === 0) { navigator.vibrate?.([10, 80, 10]); return; }
                setShowPaySheet(true);
              }}
            >
              {cart.length > 0 ? `Cobrar ${fmt(cartTotal)}` : "Cobrar"}
            </Button>
          </div>
        </section>
      </div>

      {/* ── Qty edit BottomSheet ──────────────────────── */}
      <BottomSheet
        open={showQtySheet}
        onClose={() => setShowQtySheet(false)}
        height="auto"
        title={qtyItem ? `Cantidad — ${qtyItem.name}` : "Cantidad"}
      >
        <div style={{ padding: "0 16px 24px" }}>
          <NumKeypad
            value={qtyValue}
            onChange={setQtyValue}
            showConfirm
            onConfirm={() => {
              if (qtyItem) setItemQty(qtyItem.productId, parseInt(qtyValue, 10) || 1);
              setShowQtySheet(false);
            }}
            displayLabel="Ingresa la cantidad"
          />
        </div>
      </BottomSheet>

      {/* ── Pay BottomSheet ───────────────────────────── */}
      <BottomSheet
        open={showPaySheet}
        onClose={() => !payLoading && !payNoTipLoading && setShowPaySheet(false)}
        height="auto"
        title="Confirmar cobro"
        draggable={!payLoading && !payNoTipLoading}
      >
        <div style={{ padding: "0 20px 32px", display: "flex", flexDirection: "column", gap: 12 }}>

          <div style={{ textAlign: "center", paddingBottom: 4 }}>
            {tipPercentage > 0 ? (
              <>
                <p className="ps-pay-total-label">Subtotal</p>
                <p className="ps-pay-total-amount" style={{ fontSize: "1.4rem" }}>{fmt(cartTotal)}</p>
                <p className="ps-pay-total-label" style={{ marginTop: 6 }}>
                  Propina ({tipPercentage}%)&nbsp;&nbsp;
                  <span style={{ fontWeight: 700 }}>
                    {fmt(money(cartTotal * tipPercentage / 100))}
                  </span>
                </p>
                <p className="ps-pay-total-label" style={{ marginTop: 4 }}>Total</p>
                <p className="ps-pay-total-amount">
                  {fmt(money(cartTotal + money(cartTotal * tipPercentage / 100)))}
                </p>
              </>
            ) : (
              <>
                <p className="ps-pay-total-label">Total a cobrar</p>
                <p className="ps-pay-total-amount">{fmt(cartTotal)}</p>
              </>
            )}
          </div>

          <Button
            variant="primary"
            size="xl"
            fullWidth
            loading={payLoading}
            disabled={payNoTipLoading}
            onClick={() => void handlePay()}
          >
            Confirmar cobro
          </Button>

          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            fontSize: 12, color: "var(--text-3)", fontWeight: 600,
          }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span>o bien</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          <Button
            variant="secondary"
            size="lg"
            fullWidth
            loading={payNoTipLoading}
            disabled={payLoading}
            onClick={() => void handlePay({ noTip: true })}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <line x1="5" y1="5" x2="19" y2="19" strokeOpacity=".4"/>
              </svg>
              Cobrar sin propina
            </span>
          </Button>

          <Button
            variant="ghost"
            size="md"
            fullWidth
            disabled={payLoading || payNoTipLoading}
            onClick={() => setShowPaySheet(false)}
          >
            Cancelar
          </Button>
        </div>
      </BottomSheet>

      {/* ── Split bill sheet ─────────────────────────── */}
      {showSplitSheet && (
        <Suspense fallback={null}>
          <SplitBillSheet
            open={showSplitSheet}
            onClose={() => setShowSplitSheet(false)}
            cart={cart}
            cartTotal={cartTotal}
            onAllPaid={(saleId) => {
              setCompletedSaleId(saleId);
              setCompletedTotal(cartTotal);
              setCompletedRef("Cuenta dividida");
              if (activeTicketId) {
                setOpenTickets(prev => prev.filter(t => t.id !== activeTicketId));
              }
              clearCart();
              setShowSplitSheet(false);
              void refreshStock();
              setScreen("completed");
            }}
          />
        </Suspense>
      )}

      {/* ── Composer flotante de nota (encima del teclado) ─── */}
      {showKeyboard && activeNote && (() => {
        const itemRef = activeNote.kind === "item"
          ? cart.find(i => i.productId === activeNote.productId)
          : null;
        const value = activeNote.kind === "item" ? (itemRef?.notes ?? "") : orderNotes;
        const label = activeNote.kind === "item" ? `Nota · ${itemRef?.name ?? "ítem"}` : "Nota general";
        const placeholder = activeNote.kind === "item" ? "Ej: sin cebolla..." : "Ej: mesa 5, alérgico...";
        return (
          <div className="ps-note-composer" aria-hidden="true">
            <div className="ps-note-composer-label">{label}</div>
            <div className="ps-note-composer-text">
              {value
                ? <span className="ps-note-composer-val">{value}</span>
                : <span className="ps-note-composer-ph">{placeholder}</span>}
              <span className="ps-note-composer-caret" />
            </div>
          </div>
        );
      })()}

      {/* ── Virtual keyboard ─────────────────────────── */}
      <TouchKeyboard open={showKeyboard} onClose={() => setShowKeyboard(false)} />

      {/* ── Name prompt BottomSheet (modo manual) ────── */}
      <BottomSheet
        open={showNameSheet}
        onClose={() => { setShowNameSheet(false); setPendingName(""); }}
        height="auto"
        title="Nombre de la orden"
      >
        <div style={{ padding: "0 20px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Botones rápidos */}
          {quickOrdersEnabled && quickNames.length > 0 && (
            <div className="ps-quick-names-scroll">
              {quickNames.map((name, i) => (
                <button
                  key={i}
                  className="ps-quick-name-chip"
                  onClick={() => handleCreateNamedOrder(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          <input
            className="ps-ref-input"
            placeholder="Ej: Mesa 5, Juan…"
            value={pendingName}
            onChange={e => setPendingName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleCreateNamedOrder(); }}
            autoFocus
            autoComplete="off"
          />
          <Button variant="primary" size="lg" fullWidth onClick={() => handleCreateNamedOrder()}>
            Confirmar
          </Button>
          <Button
            variant="ghost"
            size="md"
            fullWidth
            onClick={() => { setShowNameSheet(false); setPendingName(""); }}
          >
            Cancelar
          </Button>
        </div>
      </BottomSheet>
    </>
  );
}
