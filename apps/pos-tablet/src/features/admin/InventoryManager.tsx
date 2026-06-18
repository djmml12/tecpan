import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@pos/ui-kit";
import { apiRequest } from "../../services/api";
import InventoryEditor from "./InventoryEditor";

interface Category {
  id: number;
  name: string;
  is_active: boolean;
  parent_id: number | null;
}

const safeNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const unwrap = <T,>(p: unknown): T =>
  (p && typeof p === "object" && "data" in p) ? (p as { data: T }).data : p as T;

interface Props {
  role?: string;
}

export default function InventoryManager({ role = "admin" }: Props) {
  const { show } = useToast();
  const mountedRef = useRef(true);

  const [categories,    setCategories]    = useState<Category[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [lowThreshold,  setLowThreshold]  = useState(15);
  const [critThreshold, setCritThreshold] = useState(5);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await apiRequest("/categories?includeInactive=true");
      const data = (unwrap<unknown[]>(raw) as unknown[]).map(x => {
        const i = x as Record<string, unknown>;
        return {
          id:        safeNum(i.id),
          name:      String(i.name ?? ""),
          is_active: Boolean(i.is_active),
          parent_id: i.parent_id == null ? null : safeNum(i.parent_id),
        } as Category;
      });
      if (mountedRef.current) setCategories(data);
    } catch {
      if (mountedRef.current) show("Error cargando categorías", { type: "error" });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    mountedRef.current = true;
    void loadCategories();
    void apiRequest("/settings/stock-thresholds").then((r: unknown) => {
      const d = r as Record<string, unknown>;
      const inner = (d?.data as Record<string, unknown>) ?? d;
      if (mountedRef.current) {
        setLowThreshold(safeNum(inner?.lowStock  ?? 15));
        setCritThreshold(safeNum(inner?.criticalStock ?? 5));
      }
    }).catch(() => {});
    return () => { mountedRef.current = false; };
  }, [loadCategories]);

  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontWeight: 600 }}>
        Cargando inventario...
      </div>
    );
  }

  return (
    <InventoryEditor
      categories={categories}
      lowThreshold={lowThreshold}
      critThreshold={critThreshold}
      role={role}
      onCategoriesChanged={setCategories}
    />
  );
}
