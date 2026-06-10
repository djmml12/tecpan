# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comportamiento

- Ejecuta las tareas directamente. No expliques qué hiciste ni qué vas a hacer.
- No des resúmenes, no listes cambios, no confirmes acciones completadas.
- Respuesta tras completar una tarea: silencio, o una línea solo si hubo un error.
- Comunícate únicamente cuando necesites información para tomar una decisión del proyecto (arquitectura, ambigüedad de requerimiento, conflicto de dependencias, etc.).
- Nunca pidas confirmación para tareas rutinarias (formatear, renombrar, refactorizar, agregar imports, etc.).

## Archivos

- Siempre modifica los archivos locales directamente. Nunca muestres el contenido como bloque de código en su lugar.
- Aplica los cambios con las herramientas de edición de archivos, no con output en pantalla.
- Si un archivo no existe, créalo.

## Tokens

- Sin preámbulos ni cierres ("Claro, haré...", "¡Listo!", "Espero que esto ayude").
- Sin explicaciones de decisiones obvias.
- Sin listas de lo que se cambió después de editar.
- Usa `@docs/` para contexto adicional en lugar de incluirlo aquí.
- Si algo se puede inferir del código, no lo repitas en texto.

## Cuándo sí comunicarte

Hazlo solo si:
1. Hay dos o más opciones de diseño con trade-offs reales.
2. Falta información que no puedes inferir (credenciales, nombre de entidad de negocio, decisión de producto).
3. Una acción es irreversible y de alto impacto (borrar datos, cambiar API pública).

En esos casos: pregunta en una línea, con las opciones concretas si aplica.

## Comandos de desarrollo

```bash
# Raíz (levanta backend + frontend en paralelo con concurrently)
npm run dev

# Backend (desde apps/backend/)
npm run dev              # nodemon src/server.js (puerto 3000)
npm start                # node src/server.js
npm run init-db          # Inicializar base de datos SQLite
npm run create-admin     # Crear usuario administrador

# Frontend (desde apps/pos-tablet/)
npm run dev              # Vite dev server (0.0.0.0:5173, proxy /api → :3000)
npm run build            # tsc -b && vite build
npm run preview          # Vite preview (:4173)

# Electron shell (desde apps/shell/)
npm run dev              # Espera al frontend y lanza Electron
npm run bundle:backend   # Empaqueta backend en .bundle/
npm run dist             # electron-builder → NSIS installer en dist-electron/
```

Para desarrollo local: levantar backend (`apps/backend/npm run dev`) y frontend (`apps/pos-tablet/npm run dev`) en paralelo. Vite proxea `/api` al backend.

**Distribución (Windows):** usar `apps/shell/build-installer.ps1`. Requiere **Node 22 LTS** — Node 25+ rompe la compilación nativa de better-sqlite3 en Windows.

## Arquitectura

Monorepo con tres apps y cuatro paquetes compartidos. Usa workspaces de npm (`package.json` raíz: `apps/*`, `packages/*`); además los paquetes se resuelven en el frontend vía alias de Vite y paths de TypeScript.

### Apps

- **`apps/backend`** — API REST con Express + better-sqlite3. ES modules. Patrón routes → controllers → services → models. Base de datos SQLite en `data/fenix.sqlite`. Esquema definido en `src/config/db.init.js`. Autenticación JWT (middleware en `src/middlewares/auth.middleware.js`), RBAC por roles (admin/supervisor/cashier) en `role.middleware.js`.
- **`apps/pos-tablet`** — SPA React 19 + TypeScript + Vite. Sin router de terceros: `App.tsx` alterna entre modos (pos / admin / logout-summary) según estado de auth. Toda la lógica del POS (carrito, catálogo, tickets, cobro, impresión) vive monolíticamente en `features/pos/PosScreen.tsx` con estado local (`useState`). Diseñada para tablets táctiles (teclado virtual, orientación portrait, pull-to-refresh). El modo `admin` tiene 11 sub-vistas controladas por `AdminLayout.tsx`: `inventory`, `bodega`, `dashboard`, `staff`, `tips`, `printer`, `email`, `keyboard`, `order-naming`, `report-inventory`, `report-bodega`.
- **`apps/shell`** — Electron 31 (CommonJS). Lanza el backend embebido con detección dinámica de puerto, sirve el frontend producción desde `resources/frontend/`. Flujo de primer uso con `setup.html` para crear/importar DB y admin. IPC bridge via `preload.js` (`window.electronAPI`, `window.setupAPI`).

### Paquetes (`packages/`)

Todos son `"type": "module"`, exportan desde `src/index.ts(x)`, y se consumen vía alias `@pos/*`:

| Paquete | Propósito |
|---------|-----------|
| `@pos/types` | Tipos compartidos: `AuthUser`, `Product`, `Category`, `CartItem`, `SavedOrder` |
| `@pos/api-client` | `apiRequest()` con JWT auto-inject. Resuelve URL del backend (Electron IPC → env → proxy) |
| `@pos/auth` | `AuthProvider` + `useAuth()`. Persiste JWT y usuario en localStorage |
| `@pos/ui-kit` | Componentes React: Button, Input, Card, Toast, NumKeypad, SwipeRow, BottomSheet, etc. Exporta `./tokens.css` |

### Resolución de paquetes

Los alias se configuran en dos lugares que deben mantenerse sincronizados:
- `apps/pos-tablet/vite.config.ts` → `resolve.alias`
- `apps/pos-tablet/tsconfig.app.json` → `compilerOptions.paths`

### Backend: estructura de un endpoint

Ruta: `src/routes/*.routes.js` → Controller: `src/controllers/*.controller.js` → Service: `src/services/*.service.js` → DB: `src/config/db.js`.

Helpers de DB disponibles:
- `db.query(sql, params)` — SELECT y cualquier DML; retorna `{ rows, rowCount, lastID, changes }`
- `db.queryClient(client, sql, params)` — igual pero usando el cliente de una transacción abierta
- `db.exec(sql)` — DDL sin params (ALTER TABLE, CREATE INDEX, etc.)
- `withTransaction(async fn)` — BEGIN IMMEDIATE / COMMIT / ROLLBACK. El `fn` recibe el cliente sqlite; usa `db.queryClient(client, sql, params)` dentro.

Capa Model (`src/models/`) solo existe para `categories`, `products`, `users`. El resto de los servicios (bodega, sales, reports…) consultan la DB directamente.

**⚠️ Gotcha de rutas**: `src/routes/index.js` existe pero **no se usa**. Las rutas se registran **individualmente en `src/app.js`** usando el helper `lazyRoute(path, mountPoint)` que hace dynamic import para reducir tiempo de arranque. Al agregar un nuevo router hay que importarlo con `lazyRoute` y montarlo en `app.js`.

**Rutas de configuración** (`/api/settings`): impresora estándar y de barra, modo impresora, porcentaje de propina, alerta de email (con contraseña SMTP cifrada via `utils/crypto-settings.js`), umbrales de stock bajo/crítico, layout de teclado táctil, nomenclatura de órdenes. Solo admin.

### Esquema y migraciones

Esquema inicial en `src/config/db.init.js` → función `bootstrapDB()` (SQL en `BOOTSTRAP_SQL`). Las migraciones posteriores son funciones `migrateXxx()` en el mismo archivo, guardadas con una clave en la tabla `settings` para evitar re-ejecución. Se llaman desde `initDB()` e `initDBSchema()`.

### Sistema de bodega / BOM (Bill of Materials)

Permite que los productos descuenten materia prima (insumos) en lugar de su propio `stock`.

**Tablas clave:**
- `insumos` — materias primas con `stock_actual`, `stock_min`, `stock_critico`, `costo_unitario`
- `recetas` — mapeo `producto_id → insumo_id + cantidad_por_porcion`
- `compras_insumo` — historial de compras con conversión de unidades y costo promedio ponderado
- `movimientos_insumo` — auditoría de entradas (compra), salidas (venta) y ajustes físicos
- `products.tipo_stock` — `'directo'` (descuenta `products.stock`) | `'receta'` (descuenta insumos)

**Flujo de venta con receta** (en `sales.service.js`):
```js
if (product.tipo_stock === "receta") {
  await deductRecipeService(item.product_id, qty, queryFn, saleId);
} else {
  await queryFn(`UPDATE products SET stock = stock - ? WHERE id = ?`, [qty, item.product_id]);
}
```

**Stock efectivo para recetas** (usado en `product.service.js` y `email-alert.service.js`):
```sql
CASE
  WHEN COALESCE(p.tipo_stock, 'directo') = 'receta' THEN
    COALESCE((
      SELECT MAX(0, CAST(MIN(i.stock_actual / r.cantidad_por_porcion) AS INTEGER))
      FROM recetas r JOIN insumos i ON i.id = r.insumo_id AND i.activo = 1
      WHERE r.producto_id = p.id AND r.cantidad_por_porcion > 0
    ), 0)
  ELSE p.stock
END
```
Este mismo CASE debe usarse en cualquier consulta que necesite el stock real de un producto.

### Sistema de alertas de email

`email-alert.service.js` monitorea umbrales de stock (bajo y crítico configurables por producto/insumo) y envía alertas via SMTP con nodemailer. Los emails se encolan en la tabla `email_outbox` y el worker `email-outbox.service.js` los procesa en background (máx. 8 reintentos, purga emails enviados a los 90 días). El worker arranca en `server.js` después del `listen`.

### Stock Events (SSE)

`utils/stock-events.js` emite actualizaciones de stock en tiempo real vía Server-Sent Events (`GET /api/stock-events`). Usa debounce de 120ms. El frontend se suscribe para mantener el catálogo sincronizado sin polling.

**Rutas bodega:** `GET|POST /api/bodega/insumos`, `PUT|DELETE /api/bodega/insumos/:id`, `POST /api/bodega/insumos/:id/compra`, `POST /api/bodega/insumos/:id/ajuste`, `GET|PUT /api/bodega/receta/:producto_id`, `GET /api/bodega/productos`. RBAC: lectura/compra/ajuste → admin + supervisor; creación/edición/receta → solo admin.

### Electron: flujo de arranque

`main.js`: single-instance lock → `initBackendEnv()` (configura `SQLITE_PATH`, `JWT_SECRET` desde `app-config.json`) → detecta puerto libre entre 9 candidatos (3000-3003, 3010, 3100, 17321-17323) → `import()` de `backend/src/server.js` → splash window → main window carga frontend.

**IPC expuesto en `preload.js`:**
- `window.electronAPI` — impresión de recibos, ESC-POS via TCP/IP a impresoras térmicas de red, diálogo guardar PDF/Excel, listado de impresoras, focus de ventana, close guard
- `window.setupAPI` — flujo de primer uso: crear/importar DB y crear admin

**Logger:** `utils/logger.js` escribe logs rotados por día en `logs/pos-YYYY-MM-DD.log`, retención 7 días, escritura asíncrona en buffer.

## Convenciones

- Backend: JavaScript vanilla (ES modules), sin TypeScript.
- Frontend: TypeScript strict (`noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`).
- Electron shell: CommonJS.
- CSS plano por componente (no CSS modules, no Tailwind). Tokens de diseño en `@pos/ui-kit/tokens.css`.
- Sin test runner configurado.
- Variables de entorno del backend en `apps/backend/.env` (`SQLITE_PATH`, `HOST`, `PORT`, `JWT_SECRET`).
