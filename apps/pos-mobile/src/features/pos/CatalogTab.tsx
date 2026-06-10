import type { Product, Category } from "@pos/types";
import { fmt, toNum } from "@pos/pos-core";
import { Spinner } from "@pos/ui-kit";
import { useTheme } from "../../app/theme";
import "./catalog-tab.css";

function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

interface CatalogTabProps {
  filteredProducts: Product[];
  categories:       Category[];
  loading:          boolean;
  search:           string;
  setSearch:        (v: string) => void;
  selectedCat:      number | null;
  setSelectedCat:   (id: number | null) => void;
  onAdd:            (product: Product) => void;
  flashId:          number | null;
}

export default function CatalogTab({
  filteredProducts,
  categories,
  loading,
  search,
  setSearch,
  selectedCat,
  setSelectedCat,
  onAdd,
  flashId,
}: CatalogTabProps) {
  const { theme, toggle } = useTheme();

  return (
    <div className="ct-root">
      <div className="ct-search">
        <input
          className="ct-search-input"
          type="search"
          placeholder="Buscar producto…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
        />
        <button
          className="ct-theme-btn"
          onClick={toggle}
          aria-label={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
          title={theme === "dark" ? "Tema claro" : "Tema oscuro"}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>

      <div className="ct-cats" role="toolbar" aria-label="Categorías">
        <button
          className={`ct-chip${selectedCat === null ? " ct-chip--active" : ""}`}
          onClick={() => setSelectedCat(null)}
        >
          Todos
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            className={`ct-chip${selectedCat === cat.id ? " ct-chip--active" : ""}`}
            onClick={() => setSelectedCat(cat.id)}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="ct-center">
          <Spinner size="md" />
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="ct-center">
          <p className="ct-empty-text">Sin productos</p>
        </div>
      ) : (
        <div className="ct-grid">
          {filteredProducts.map((p) => (
            <button
              key={p.id}
              className={`ct-card${flashId === p.id ? " ct-card--flash" : ""}`}
              onClick={() => onAdd(p)}
            >
              <span className="ct-card-name">{p.name}</span>
              <span className="ct-card-price">{fmt(toNum(p.price))}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
