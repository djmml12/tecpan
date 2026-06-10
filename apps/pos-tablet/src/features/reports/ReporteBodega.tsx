import { useEffect, useRef, useState } from "react";
import { Button, Spinner, useToast } from "@pos/ui-kit";
import { apiRequest, getBackendBaseUrl } from "../../services/api";
import "./reporte.css";

interface InsumoRow {
  nombre:         string;
  unidad_base:    string;
  stock_actual:   number;
  stock_min:      number;
  stock_critico:  number;
  costo_unitario: number;
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

function stockClass(row: InsumoRow): string {
  const s = Number(row.stock_actual  || 0);
  const c = Number(row.stock_critico || 0);
  const m = Number(row.stock_min     || 0);
  if (c > 0 && s <= c) return "rpt-stock--critical";
  if (m > 0 && s <= m) return "rpt-stock--low";
  return "";
}

export default function ReporteBodega() {
  const [rows,        setRows]        = useState<InsumoRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [downloading, setDownloading] = useState<DownloadFormat | null>(null);
  const [search,      setSearch]      = useState("");
  const mountedRef = useRef(true);
  const { show }   = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/reports/bodega") as { success: boolean; data: InsumoRow[] };
      if (mountedRef.current && res?.data) setRows(res.data);
    } catch {
      if (mountedRef.current) show("Error al cargar bodega", { type: "error" });
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
      const url   = `${base}/api/reports/bodega/export?format=${format}`;
      const res   = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error("Error al generar el reporte");

      const blob        = await res.blob();
      const defaultName = `reporte_bodega_${new Date().toISOString().slice(0, 10)}.${ext}`;

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
    return r.nombre.toLowerCase().includes(search.toLowerCase());
  });

  const critCount = filtered.filter((r) => {
    const s = Number(r.stock_actual || 0);
    const c = Number(r.stock_critico || 0);
    return c > 0 && s <= c;
  }).length;

  const lowCount = filtered.filter((r) => {
    const s = Number(r.stock_actual  || 0);
    const c = Number(r.stock_critico || 0);
    const m = Number(r.stock_min     || 0);
    return m > 0 && s > c && s <= m;
  }).length;

  return (
    <div className="rpt-layout">
      <div className="rpt-header">
        <div className="rpt-header-left">
          <div className="rpt-title">Reporte de bodega</div>
          <div className="rpt-subtitle">{rows.length} insumos</div>
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

      {(critCount > 0 || lowCount > 0) && (
        <div className="rpt-alerts">
          {critCount > 0 && (
            <span className="rpt-badge rpt-badge--critical">{critCount} crítico{critCount !== 1 ? "s" : ""}</span>
          )}
          {lowCount > 0 && (
            <span className="rpt-badge rpt-badge--low">{lowCount} bajo{lowCount !== 1 ? "s" : ""}</span>
          )}
        </div>
      )}

      <div className="rpt-search-bar">
        <input
          className="rpt-search"
          placeholder="Buscar insumo..."
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
                <th>Insumo</th>
                <th>Unidad</th>
                <th className="rpt-num">Stock actual</th>
                <th className="rpt-num">Mínimo</th>
                <th className="rpt-num">Crítico</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="rpt-empty">Sin resultados</td></tr>
              ) : (
                filtered.map((row, i) => {
                  const cls = stockClass(row);
                  return (
                    <tr key={i} className={cls}>
                      <td className="rpt-name">{row.nombre}</td>
                      <td className="rpt-cat">{row.unidad_base || "—"}</td>
                      <td className={`rpt-num ${cls}`}>{Number(row.stock_actual || 0)}</td>
                      <td className="rpt-num rpt-muted">{Number(row.stock_min || 0)}</td>
                      <td className="rpt-num rpt-muted">{Number(row.stock_critico || 0)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={4} className="rpt-total-label">Total insumos</td>
                  <td className="rpt-num rpt-total-val">{filtered.length}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  );
}
