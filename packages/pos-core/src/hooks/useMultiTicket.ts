import { useCallback, useMemo, useState } from "react";
import type { Product, CartItem, SavedOrder } from "@pos/types";
import type { TicketSlot } from "../types";
import { money, toNum } from "../utils";

let SLOT_SEQ = 0;
const newSlotId = () => `slot_${Date.now()}_${(SLOT_SEQ++).toString(36)}`;

function emptySlot(): TicketSlot {
  return {
    id: newSlotId(),
    cart: [],
    orderRef: "",
    orderNotes: "",
    currentOrderId: null,
    monthlyNum: null,
  };
}

export interface LoadOrderArgs {
  items:      CartItem[];
  notes:      string;
  orderId:    number;
  monthlyNum: number | null;
  reference:  string;
}

/** Maneja N tickets abiertos en memoria; opera siempre sobre el activo. */
export function useMultiTicket() {
  const [slots, setSlots] = useState<TicketSlot[]>(() => [emptySlot()]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [flashId, setFlashId] = useState<number | null>(null);

  const active = slots[activeIndex] ?? slots[0];

  const patchActive = useCallback((patch: (s: TicketSlot) => TicketSlot) => {
    setSlots(prev => prev.map((s, i) => (i === activeIndex ? patch(s) : s)));
  }, [activeIndex]);

  const cart           = active?.cart ?? [];
  const orderRef       = active?.orderRef ?? "";
  const orderNotes     = active?.orderNotes ?? "";
  const currentOrderId = active?.currentOrderId ?? null;

  const cartTotal = useMemo(
    () => money(cart.reduce((s, i) => s + money(i.price * i.quantity), 0)),
    [cart],
  );

  const addToCart = useCallback((product: Product) => {
    const price = toNum(product.price);
    patchActive(s => {
      const existing = s.cart.find(i => i.productId === product.id);
      const nextCart = existing
        ? s.cart.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i)
        : [...s.cart, { productId: product.id, name: product.name, price, quantity: 1 }];
      return { ...s, cart: nextCart };
    });
    setFlashId(product.id);
    navigator.vibrate?.(10);
    window.setTimeout(() => setFlashId(null), 400);
  }, [patchActive]);

  const increaseQty = useCallback((productId: number) => {
    patchActive(s => ({
      ...s,
      cart: s.cart.map(i => i.productId === productId ? { ...i, quantity: i.quantity + 1 } : i),
    }));
  }, [patchActive]);

  const decreaseQty = useCallback((productId: number) => {
    patchActive(s => {
      const item = s.cart.find(i => i.productId === productId);
      if (!item) return s;
      const nextCart = item.quantity <= 1
        ? s.cart.filter(i => i.productId !== productId)
        : s.cart.map(i => i.productId === productId ? { ...i, quantity: i.quantity - 1 } : i);
      return { ...s, cart: nextCart };
    });
  }, [patchActive]);

  const removeItem = useCallback((productId: number) => {
    patchActive(s => ({
      ...s,
      cart: s.cart.filter(i => i.productId !== productId),
    }));
  }, [patchActive]);

  const setItemNotes = useCallback((productId: number, notes: string) => {
    patchActive(s => ({
      ...s,
      cart: s.cart.map(i => i.productId === productId ? { ...i, notes: notes || undefined } : i),
    }));
  }, [patchActive]);

  const setOrderRef   = useCallback((v: string) => patchActive(s => ({ ...s, orderRef: v })),   [patchActive]);
  const setOrderNotes = useCallback((v: string) => patchActive(s => ({ ...s, orderNotes: v })), [patchActive]);

  const createTicket = useCallback((ref?: string) => {
    setSlots(prev => [...prev, { ...emptySlot(), orderRef: ref ?? "" }]);
    setActiveIndex(slots.length);
  }, [slots.length]);

  const switchTicket = useCallback((index: number) => {
    setActiveIndex(prev => (index >= 0 && index < slots.length ? index : prev));
  }, [slots.length]);

  const closeTicket = useCallback((index: number) => {
    setSlots(prev => (prev.length <= 1 ? [emptySlot()] : prev.filter((_, i) => i !== index)));
    setActiveIndex(ai => {
      const newLen = Math.max(1, slots.length - 1);
      if (index < ai)        return Math.max(0, ai - 1);
      if (index === ai)      return Math.min(ai, newLen - 1);
      return ai;
    });
  }, [slots.length]);

  const resetTicket   = useCallback(() => patchActive(() => emptySlot()), [patchActive]);
  const clearAfterPay = useCallback(() => patchActive(() => emptySlot()), [patchActive]);

  const loadOrder = useCallback((args: LoadOrderArgs) => {
    patchActive(s => ({
      ...s,
      cart:           args.items,
      orderNotes:     args.notes,
      orderRef:       args.reference,
      currentOrderId: args.orderId,
      monthlyNum:     args.monthlyNum,
    }));
  }, [patchActive]);

  /** Abre una orden en un slot nuevo, o cambia al slot existente si ya está cargada. */
  const openOrder = useCallback((args: LoadOrderArgs) => {
    const existingIdx = slots.findIndex(s => s.currentOrderId === args.orderId);
    if (existingIdx !== -1) {
      setActiveIndex(existingIdx);
      return;
    }
    const newSlot: TicketSlot = {
      ...emptySlot(),
      cart:           args.items,
      orderNotes:     args.notes,
      orderRef:       args.reference,
      currentOrderId: args.orderId,
      monthlyNum:     args.monthlyNum,
    };
    setSlots(prev => [...prev, newSlot]);
    setActiveIndex(slots.length);
  }, [slots]);

  const applySavedOrder = useCallback((order: SavedOrder) => {
    patchActive(s => ({
      ...s,
      currentOrderId: order.id,
      monthlyNum:     order.monthly_number ?? null,
      orderRef:       order.reference || s.orderRef,
    }));
  }, [patchActive]);

  return {
    slots, activeIndex, cart, cartTotal, orderRef, orderNotes, currentOrderId, flashId,
    addToCart, increaseQty, decreaseQty, removeItem, setItemNotes, setOrderRef, setOrderNotes,
    createTicket, switchTicket, closeTicket, resetTicket, clearAfterPay, loadOrder, openOrder, applySavedOrder,
  };
}
