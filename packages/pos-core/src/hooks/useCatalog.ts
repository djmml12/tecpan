import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "@pos/api-client";
import { useToast } from "@pos/ui-kit";
import type { Product, Category } from "@pos/types";

/** Carga productos + categorías y expone búsqueda/filtro por categoría. */
export function useCatalog() {
  const { show } = useToast();
  const mountedRef = useRef(true);

  const [products,   setProducts]   = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [selectedCat, setSelectedCat] = useState<number | null>(null);

  const deferredSearch = useDeferredValue(search);

  const loadProducts = useCallback(async () => {
    try {
      const data = (await apiRequest("/products")) as Product[];
      if (mountedRef.current) {
        setProducts(data ?? []);
        setLoading(false);
      }
    } catch {
      if (mountedRef.current) {
        setLoading(false);
        show("Error cargando productos", { type: "error" });
      }
    }
  }, [show]);

  const loadCategories = useCallback(async () => {
    try {
      const data = (await apiRequest("/categories")) as Category[];
      if (mountedRef.current) setCategories(data ?? []);
    } catch {
      /* no crítico */
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void loadProducts();
    void loadCategories();
    return () => { mountedRef.current = false; };
  }, [loadProducts, loadCategories]);

  const filteredProducts = useMemo(() => {
    let list = products;
    if (selectedCat !== null) list = list.filter(p => p.category_id === selectedCat);
    const q = deferredSearch.trim().toLowerCase();
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q));
    return list;
  }, [products, selectedCat, deferredSearch]);

  const refresh = useCallback(() => {
    void loadProducts();
    void loadCategories();
  }, [loadProducts, loadCategories]);

  return {
    products, categories, filteredProducts, loading,
    search, setSearch, selectedCat, setSelectedCat, refresh,
  };
}
