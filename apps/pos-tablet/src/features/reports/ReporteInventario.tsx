import { useEffect, useRef, useState } from "react";
import { Button, Spinner, useToast } from "@pos/ui-kit";
import { apiRequest, getBackendBaseUrl } from "../../services/api";
import "./reporte.css";

interface ProductoRow {
  name:            string;
  category:        string;
  subcategory:     string;
  stock:           number;
  cost_price:      number;
  price:           number;
  inventory_value: number;
}

type DownloadFormat = "pdf" | "excel";

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  );
}

export default function ReporteInventario() {
  const [rows,        setRows]        = useState<ProductoRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [downloading, setDownloading] = useState<DownloadFormat | null>(null);
  const [search,      setSearch]      = useState("");
  const mountedRef = useRef(true);
  const { show }   = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/reports/inventory") as { success: boolean; data: ProductoRow[] };
      if (mountedRef.current && res?.data) setRows(res.data);
    } catch {
      if (mountedRef.current) show("Error al cargar inventario", { type: "error" });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => { mountedRef.current = false; };
  }, []);

  const handleDownload = async (format: DownloadFormat) => {
    setDownloading(format);
    try {
      const base  = await getBackendBaseUrl();
      const token = localStorage.getItem("token");
      const ext   = format === "pdf" ? "pdf" : "xlsx";
      const url   = `${base}/api/reports/inventory/export?format=${format}`;
      const res   = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error("Error al generar el reporte");

      const blob        = await res.blob();
      const defaultName = `reporte_inventario_${new Date().toISOString().slice(0, 10)}.${ext}`;

      const electronAPI = (window as Window & {
        electronAPI?: { saveReportFile?: (p: { bytes: number[]; defaultName: string; ext: string }) => Promise<{ canceled: boolean }> };
      }).electronAPI;

      if (electronAPI?.saveReportFile) {
        const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
        await electronAPI.saveReportFile({ bytes, defaultName, ext });
      } else {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = defaultName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(link.href);
      }
    } catch (err) {
      show(err instanceof Error ? err.message : "Error al descargar", { type: "error" });
    } finally {
      if (mountedRef.current) setDownloading(null);
    }
  };

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.name.toLowerCase().includes(q) || (r.category || "").toLowerCase().includes(q);
  });

  const totalStock = filtered.reduce((s, r) => s + Number(r.stock || 0), 0);

  return (
    <div className="rpt-layout">
      <div className="rpt-header">
        <div className="rpt-header-left">
          <div className="rpt-title">Reporte de inventario</div>
          <div className="rpt-subtitle">{rows.length} productos</div>
        </div>
        <div className="rpt-actions">
          <button className="rpt-refresh-btn" onClick={load} disabled={loading} title="Actualizar">
            <RefreshIcon />
          </button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleDownload("excel")}
            disabled={downloading !== null || loading}
            loading={downloading === "excel"}
          >
            <span className="rpt-btn-inner"><DownloadIcon /><span>Excel</span></span>
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleDownload("pdf")}
            disabled={downloading !== null || loading}
            loading={downloading === "pdf"}
          >
            <span className="rpt-btn-inner"><DownloadIcon /><span>PDF</span></span>
          </Button>
        </div>
      </div>

      <div className="rpt-search-bar">
        <input
          className="rpt-search"
          placeholder="Buscar producto o categoría..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="rpt-table-wrap">
        {loading ? (
          <div className="rpt-loading"><Spinner size="lg" /></div>
        ) : (
          <table className="rpt-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Categoría</th>
                <th className="rpt-num">Stock</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={3} className="rpt-empty">Sin resultados</td></tr>
              ) : (
                filtered.map((row, i) => {
                  const stock = Number(row.stock || 0);
                  const cat   = row.subcategory
                    ? `${row.category} / ${row.subcategory}`
                    : row.category || "—";
                  return (
                    <tr key={i}>
                      <td className="rpt-name">{row.name}</td>
                      <td className="rpt-cat">{cat}</td>
                      <td className="rpt-num">{stock}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={2} className="rpt-total-label">Total unidades</td>
                  <td className="rpt-num rpt-total-val">{totalStock.toLocaleString("es-GT")}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  );
}
