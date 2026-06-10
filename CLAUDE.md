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
- Si algo se puede inferir del código, no lo repitas en texto.

## Cuándo sí comunicarte

Hazlo solo si:
1. Hay dos o más opciones de diseño con trade-offs reales.
2. Falta información que no puedes inferir (credenciales, nombre de entidad de negocio, decisión de producto).
3. Una acción es irreversible y de alto impacto (borrar datos, cambiar API pública).

En esos casos: pregunta en una línea, con las opciones concretas si aplica.

## Comandos de desarrollo

```bash
# Raíz (levanta backend + ambos frontends en paralelo)
npm run dev

# Solo backend + tablet
npm run dev:tablet

# Solo backend + mobile
npm run dev:mobile

# Backend (desde apps/backend/)
npm run dev              # nodemon src/server.js (puerto 3000)
npm start                # node src/server.js
npm run init-db          # Inicializar base de datos SQLite
npm run create-admin     # Crear usuario administrador

# Frontend tablet (desde apps/pos-tablet/)
npm run dev              # Vite dev server (0.0.0.0:5173, proxy /api → :3000)
npm run build            # tsc -b && vite build
npm run preview          # Vite preview (:4173)

# Frontend mobile (desde apps/pos-mobile/)
npm run dev              # Vite dev server (0.0.0.0:5174, proxy /api → :3000)
npm run build            # tsc -b && vite build
npm run preview          # Vite preview (:4174)

# Electron shell (desde apps/shell/)
npm run dev              # Espera al frontend y lanza Electron
npm run bundle:backend   # Empaqueta backend en .bundle/
npm run dist             # electron-builder → NSIS installer en dist-electron/

# Distribuir (Windows)
npm run build:installer  # scripts/build-installer.ps1
```

**Requiere Node 22 LTS** para distribución — Node 25+ rompe la compilación nativa de better-sqlite3.

## Arquitectura

Monorepo con **cuatro apps** y **cinco paquetes** compartidos. Workspaces npm (`apps/*`, `packages/*`). Los paquetes se resuelven en los frontends vía alias de Vite y paths de TypeScript.

### Apps

- **`apps/backend`** — API REST Express + better-sqlite3. ES modules. Patrón routes → controllers → services → (models para categories/products/users, DB directa para el resto). Base de datos SQLite en `data/fenix.sqlite`. JWT + RBAC por roles (admin/supervisor/cajero/mesero). Rutas registradas con `lazyRoute()` en `src/app.js`.

- **`apps/pos-tablet`** — SPA React 19 + TypeScript + Vite. Puerto 5173. Sin router de terceros: `App.tsx` alterna entre modos (`pos` / `admin` / `logout-summary`) según auth. Diseñada para tablet en portrait con teclado virtual. La lógica del POS vive en `features/pos/PosScreen.tsx` usando estado local; **no usa `@pos/pos-core`** (aún no migrada). El modo admin tiene 12 sub-vistas en `AdminLayout.tsx`: `inventory`, `bodega`, `dashboard`, `staff`, `tips`, `printer`, `email`, `keyboard`, `order-naming`, `report-inventory`, `report-bodega`, `reorder`.

- **`apps/pos-mobile`** — SPA React 19 + TypeScript + Vite. Puerto 5174. Tres pestañas: catálogo (POS), ticket y cuenta. Estructura en `layout/MobileShell.tsx` + hooks de `@pos/pos-core`. **Sí usa `@pos/pos-core`** — fuente de verdad para lógica compartida.

- **`apps/shell`** — Electron 31 (CommonJS). Embebe backend y sirve frontend compilado. Flujo primer uso con `setup.html`. IPC en `preload.js` (`window.electronAPI`, `window.setupAPI`). Puertos candidatos: 3000-3003, 3010, 3100, 17321-17323.

### Paquetes (`packages/`)

Todos son `"type": "module"`, exportan desde `src/index.ts(x)`, se consumen vía alias `@pos/*`:

| Paquete | Propósito |
|---------|-----------|
| `@pos/types` | Tipos compartidos: `AuthUser`, `Product`, `Category`, `CartItem`, `SavedOrder` |
| `@pos/api-client` | `apiRequest()` con JWT auto-inject. Resuelve URL (Electron IPC → env → proxy Vite) |
| `@pos/auth` | `AuthProvider` + `useAuth()`. Persiste JWT en localStorage |
| `@pos/ui-kit` | Componentes React: Button, Input, Card, Toast, NumKeypad, SwipeRow, BottomSheet, TouchKeyboard, etc. Exporta `./tokens.css` |
| `@pos/pos-core` | Lógica de POS compartida: `useCatalog`, `useMultiTicket`, `useCheckout`, `useOrders`, `usePrinting`, utilidades `fmt`/`money`/`toNum`. Solo lo consume `pos-mobile` hoy; `pos-tablet` tiene su propia lógica local. |

### Resolución de paquetes

Alias configurados en dos lugares que deben mantenerse sincronizados por cada frontend:
- `apps/pos-tablet/vite.config.ts` → `resolve.alias` (5 paquetes, sin `@pos/pos-core`)
- `apps/pos-tablet/tsconfig.app.json` → `compilerOptions.paths`
- `apps/pos-mobile/vite.config.ts` → `resolve.alias` (5 paquetes, incluye `@pos/pos-core`)
- `apps/pos-mobile/tsconfig.app.json` → `compilerOptions.paths`

### Backend: estructura de un endpoint

`src/routes/*.routes.js` → `src/controllers/*.controller.js` → `src/services/*.service.js` → `src/config/db.js`

Helpers de DB:
- `db.query(sql, params)` — SELECT y DML; retorna `{ rows, rowCount, lastID, changes }`
- `db.queryClient(client, sql, params)` — igual, dentro de una transacción
- `db.exec(sql)` — DDL sin params (ALTER TABLE, CREATE INDEX, etc.)
- `withTransaction(async fn)` — BEGIN IMMEDIATE / COMMIT / ROLLBACK; `fn` recibe el cliente sqlite

**⚠️ Gotcha de rutas**: las rutas se registran individualmente en `src/app.js` con `lazyRoute(() => import(...))`. Al agregar un router hay que importarlo ahí.

### Esquema y migraciones

Esquema inicial en `src/config/db.init.js` → `bootstrapDB()` (ejecutado una vez; flag `schema_bootstrapped` en tabla `settings`). Migraciones posteriores: funciones `migrateXxx()` en el mismo archivo, idempotentes por clave en `settings`. Se llaman desde `initDB()` e `initDBSchema()`.

### Sistema de bodega / BOM

- `insumos` — materias primas con stock, umbrales y costo
- `recetas` — mapeo `producto_id → insumo_id + cantidad_por_porcion`
- `compras_insumo` / `movimientos_insumo` — historial y auditoría
- `products.tipo_stock` — `'directo'` (descuenta `products.stock`) | `'receta'` (descuenta insumos)

**Stock efectivo para recetas** — usar este CASE en cualquier consulta que necesite el stock real:
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

**Rutas bodega:** `GET|POST /api/bodega/insumos`, `PUT|DELETE /api/bodega/insumos/:id`, `POST /api/bodega/insumos/:id/compra`, `POST /api/bodega/insumos/:id/ajuste`, `GET|PUT /api/bodega/receta/:producto_id`, `GET /api/bodega/productos`. RBAC: lectura/compra/ajuste → admin + supervisor; creación/edición/receta → solo admin.

### Alertas de email

`email-alert.service.js` monitorea umbrales de stock. Los emails se encolan en `email_outbox` y el worker `email-outbox.service.js` los procesa (máx. 8 reintentos, purga a 90 días). Arranca en `server.js` tras el `listen`.

### Stock Events (SSE)

`utils/stock-events.js` emite actualizaciones en tiempo real via `GET /api/stock-events` (debounce 120ms). El frontend se suscribe para mantener el catálogo sincronizado.

### Rutas de configuración

`/api/settings` (solo admin): impresora estándar y de barra, modo impresora, porcentaje de propina, alerta email (contraseña SMTP cifrada via `utils/crypto-settings.js`), umbrales de stock, layout de teclado táctil, nomenclatura de órdenes.

### Electron: flujo de arranque

`main.js`: single-instance lock → `initBackendEnv()` (configura `SQLITE_PATH`, `JWT_SECRET` desde `app-config.json`) → detecta puerto libre → `import()` backend → splash → main window.

**IPC (`preload.js`):**
- `window.electronAPI` — impresión de recibos, ESC-POS TCP/IP, diálogo PDF/Excel, listado de impresoras, focus, close guard
- `window.setupAPI` — flujo primer uso: crear/importar DB y admin

**Logger:** `utils/logger.js` — logs rotados por día en `logs/pos-YYYY-MM-DD.log`, retención 7 días, escritura async.

## Convenciones

- Backend: JavaScript vanilla (ES modules), sin TypeScript.
- Frontends: TypeScript strict (`noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`).
- Electron shell: CommonJS.
- CSS plano por componente (no CSS modules, no Tailwind). Tokens en `@pos/ui-kit/tokens.css`.
- Sin test runner configurado.
- Variables de entorno del backend en `apps/backend/.env` (`SQLITE_PATH`, `HOST`, `PORT`, `JWT_SECRET`).
