import db, { querySync } from "./db.js";

// ── Bootstrap SQL ─────────────────────────────────────────────────────────────
// Se ejecuta UNA SOLA VEZ (primer arranque). En arranques posteriores se salta
// gracias al flag 'schema_bootstrapped' en settings.

const BOOTSTRAP_SQL = `
  BEGIN;

  CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );
  CREATE TABLE IF NOT EXISTS permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );
  CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    name TEXT,
    password TEXT NOT NULL,
    role_id INTEGER REFERENCES roles(id),
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    is_active INTEGER DEFAULT 1,
    display_order INTEGER DEFAULT 0,
    parent_id INTEGER REFERENCES categories(id),
    printer_target TEXT DEFAULT 'kitchen'
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    stock INTEGER DEFAULT 0,
    cost_price REAL DEFAULT 0,
    price REAL NOT NULL,
    category_id INTEGER REFERENCES categories(id),
    is_active INTEGER DEFAULT 1,
    display_order INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS inventory_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER REFERENCES products(id),
    quantity INTEGER,
    movement_type TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    total REAL DEFAULT 0,
    status TEXT DEFAULT 'open',
    reference TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    canceled_at TEXT,
    canceled_by INTEGER REFERENCES users(id),
    paid_by INTEGER REFERENCES users(id),
    paid_at TEXT,
    tip_amount REAL DEFAULT 0,
    tip_percentage REAL DEFAULT 0,
    notes TEXT,
    monthly_number INTEGER
  );
  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER REFERENCES sales(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    quantity INTEGER,
    price_at_sale REAL,
    cost_at_sale REAL,
    subtotal REAL,
    notes TEXT
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS email_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    to_addr TEXT NOT NULL,
    cc_addrs TEXT DEFAULT '[]',
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    next_try_at TEXT DEFAULT (datetime('now', 'localtime')),
    last_error TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    sent_at TEXT
  );
  CREATE TABLE IF NOT EXISTS stock_alert_state (
    product_id INTEGER PRIMARY KEY,
    level TEXT NOT NULL,
    changed_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_categories_parent_active_order ON categories(parent_id, is_active, display_order);
  CREATE INDEX IF NOT EXISTS idx_products_category_active_order ON products(category_id, is_active, display_order);
  CREATE INDEX IF NOT EXISTS idx_sales_status_created_at ON sales(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_sales_status_paid_at ON sales(status, paid_at);
  CREATE INDEX IF NOT EXISTS idx_sales_user_status ON sales(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_sales_monthly_num ON sales(substr(created_at, 1, 7), monthly_number);
  CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
  CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);
  CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_created ON inventory_movements(product_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_email_outbox_pending_next ON email_outbox(next_try_at, status);
  CREATE INDEX IF NOT EXISTS idx_stock_alert_state_level ON stock_alert_state(level);

  CREATE TABLE IF NOT EXISTS insumos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    unidad_base TEXT DEFAULT 'pieza',
    stock_actual REAL DEFAULT 0,
    stock_min REAL DEFAULT 0,
    stock_critico REAL DEFAULT 0,
    costo_unitario REAL DEFAULT 0,
    activo INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
  CREATE TABLE IF NOT EXISTS compras_insumo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    insumo_id INTEGER NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
    cantidad_compra REAL NOT NULL,
    unidad_compra TEXT DEFAULT 'libra',
    factor_a_base REAL NOT NULL DEFAULT 1,
    cantidad_base REAL NOT NULL,
    costo_total REAL DEFAULT 0,
    costo_unitario REAL DEFAULT 0,
    notas TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
  CREATE TABLE IF NOT EXISTS recetas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    insumo_id INTEGER NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
    cantidad_por_porcion REAL NOT NULL,
    UNIQUE(producto_id, insumo_id)
  );
  CREATE TABLE IF NOT EXISTS movimientos_insumo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    insumo_id INTEGER NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    cantidad REAL NOT NULL,
    referencia TEXT,
    notas TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_recetas_producto ON recetas(producto_id);
  CREATE INDEX IF NOT EXISTS idx_recetas_insumo ON recetas(insumo_id);
  CREATE INDEX IF NOT EXISTS idx_movimientos_insumo_id ON movimientos_insumo(insumo_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_compras_insumo_id ON compras_insumo(insumo_id);

  INSERT OR IGNORE INTO roles (id, name) VALUES (1, 'admin');
  INSERT OR IGNORE INTO roles (id, name) VALUES (2, 'supervisor');
  INSERT OR IGNORE INTO roles (id, name) VALUES (3, 'cashier');

  INSERT OR IGNORE INTO permissions (id, name) VALUES (1, 'view_dashboard');
  INSERT OR IGNORE INTO permissions (id, name) VALUES (2, 'manage_products');
  INSERT OR IGNORE INTO permissions (id, name) VALUES (3, 'manage_categories');
  INSERT OR IGNORE INTO permissions (id, name) VALUES (4, 'manage_users');
  INSERT OR IGNORE INTO permissions (id, name) VALUES (5, 'process_sales');
  INSERT OR IGNORE INTO permissions (id, name) VALUES (6, 'view_reports');
  INSERT OR IGNORE INTO permissions (id, name) VALUES (7, 'cancel_sales');

  INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (1, 1);
  INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (1, 2);
  INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (1, 3);
  INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (1, 4);
  INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (1, 5);
  INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (1, 6);
  INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (1, 7);

  INSERT OR IGNORE INTO settings (key, value) VALUES ('tip_percentage', '15');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('schema_bootstrapped', '1');

  COMMIT;
`;

// ── Bootstrap ─────────────────────────────────────────────────────────────────
// Comprueba el flag de forma síncrona (querySync) antes de ejecutar las ~55
// sentencias SQL. En DB ya inicializada el costo es una sola lectura de índice.

const bootstrapDB = () => {
  const rows = querySync(`SELECT value FROM settings WHERE key = 'schema_bootstrapped'`);
  if (rows[0]?.value === "1") return; // ya inicializado → saltar todo el bloque
  db.exec(BOOTSTRAP_SQL);
};

// ── Seed ──────────────────────────────────────────────────────────────────────

const seedAdminUser = async () => {
  const { rows } = await db.query(
    `SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = 'admin' LIMIT 1`
  );
  if (rows.length) return;
  const { default: bcrypt } = await import("bcryptjs");
  const hash = await bcrypt.hash("admin123", 12);
  await db.query(`INSERT INTO users (username, password, role_id) VALUES (?, ?, ?)`, ["admin", hash, 1]);
};

// ── Migraciones ───────────────────────────────────────────────────────────────
// Las funciones individuales mantienen sus propios guards internos para ser
// seguras si se llaman directamente (setup, tests). initDB las llama solo cuando
// el flag del batch indica que aún no están completas.

const migrateSalesTimestampsToWindowsLocal = async () => {
  const { rows } = await db.query(`SELECT value FROM settings WHERE key = ?`, ["timestamp_storage_mode"]);
  if (rows[0]?.value === "windows-local") return;

  await db.query(`
    UPDATE sales
       SET created_at  = datetime(created_at, 'localtime'),
           paid_at     = CASE WHEN paid_at IS NULL OR paid_at = '' THEN paid_at ELSE datetime(paid_at, 'localtime') END,
           canceled_at = CASE WHEN canceled_at IS NULL OR canceled_at = '' THEN canceled_at ELSE datetime(canceled_at, 'localtime') END
     WHERE created_at IS NOT NULL
  `);

  await db.query(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ["timestamp_storage_mode", "windows-local"]
  );
};

const migrateStockAlertStateToTable = async () => {
  const { rows } = await db.query(`SELECT value FROM settings WHERE key = 'stock_alert_state_migrated_v2'`);
  if (rows[0]?.value === "1") return;

  const { rows: old } = await db.query(
    `SELECT key, value FROM settings WHERE key LIKE 'email_stock_alert_state_%'`
  );
  for (const row of old) {
    const productId = Number(row.key.replace("email_stock_alert_state_", ""));
    if (!productId || !["low", "critical"].includes(row.value)) continue;
    await db.query(
      `INSERT INTO stock_alert_state (product_id, level) VALUES (?, ?)
       ON CONFLICT(product_id) DO UPDATE SET level = excluded.level`,
      [productId, row.value]
    );
  }
  await db.query(`DELETE FROM settings WHERE key LIKE 'email_stock_alert_state_%'`);
  await db.query(
    `INSERT INTO settings (key, value) VALUES ('stock_alert_state_migrated_v2', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
};

const backfillMonthlyNumbers = async () => {
  const { rows } = await db.query(`
    SELECT id, substr(created_at, 1, 7) AS month
    FROM sales
    WHERE monthly_number IS NULL
    ORDER BY created_at ASC
  `);
  const monthCounters = new Map();
  for (const row of rows) {
    const month = row.month ?? "0000-00";
    if (!monthCounters.has(month)) {
      const { rows: mxRows } = await db.query(
        `SELECT COALESCE(MAX(monthly_number), 0) AS mx FROM sales WHERE substr(created_at, 1, 7) = ?`,
        [month]
      );
      monthCounters.set(month, Number(mxRows[0]?.mx ?? 0));
    }
    const next = monthCounters.get(month) + 1;
    monthCounters.set(month, next);
    await db.query(`UPDATE sales SET monthly_number = ? WHERE id = ?`, [next, row.id]);
  }
  // Marcar como completada para no escanear la tabla sales en arranques futuros
  await db.query(
    `INSERT INTO settings (key, value) VALUES ('monthly_numbers_backfilled_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
};

const migrateBodegaV1 = async () => {
  const { rows } = await db.query(`SELECT value FROM settings WHERE key = 'bodega_schema_v1'`);
  if (rows[0]?.value === "1") return;
  const { rows: cols } = await db.query(`PRAGMA table_info(products)`);
  if (!cols.some((c) => c.name === "tipo_stock")) {
    db.exec(`ALTER TABLE products ADD COLUMN tipo_stock TEXT DEFAULT 'directo'`);
  }
  await db.query(
    `INSERT INTO settings (key, value) VALUES ('bodega_schema_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
};

const migrateSalesIdempotencyV1 = async () => {
  const { rows } = await db.query(`SELECT value FROM settings WHERE key = 'sales_idempotency_v1'`);
  if (rows[0]?.value === "1") return;
  const { rows: cols } = await db.query(`PRAGMA table_info(sales)`);
  if (!cols.some((c) => c.name === "client_request_id")) {
    db.exec(`ALTER TABLE sales ADD COLUMN client_request_id TEXT`);
  }
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_client_request_id
           ON sales(client_request_id) WHERE client_request_id IS NOT NULL`);
  await db.query(
    `INSERT INTO settings (key, value) VALUES ('sales_idempotency_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
};

const migrateCategoryArchiveV1 = async () => {
  const { rows } = await db.query(`SELECT value FROM settings WHERE key = 'category_archive_v1'`);
  if (rows[0]?.value === "1") return;
  const { rows: cols } = await db.query(`PRAGMA table_info(categories)`);
  if (!cols.some((c) => c.name === "archived_at")) {
    db.exec(`ALTER TABLE categories ADD COLUMN archived_at TEXT`);
  }
  await db.query(
    `INSERT INTO settings (key, value) VALUES ('category_archive_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
};

const migrateProductArchiveV1 = async () => {
  const { rows } = await db.query(`SELECT value FROM settings WHERE key = 'product_archive_v1'`);
  if (rows[0]?.value === "1") return;
  const { rows: cols } = await db.query(`PRAGMA table_info(products)`);
  if (!cols.some((c) => c.name === "archived_at")) {
    db.exec(`ALTER TABLE products ADD COLUMN archived_at TEXT`);
  }
  await db.query(
    `INSERT INTO settings (key, value) VALUES ('product_archive_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
};

const migrateUserSoftDeleteV1 = async () => {
  const { rows } = await db.query(`SELECT value FROM settings WHERE key = 'user_soft_delete_v1'`);
  if (rows[0]?.value === "1") return;
  const { rows: cols } = await db.query(`PRAGMA table_info(users)`);
  if (!cols.some((c) => c.name === "deleted_at")) {
    db.exec(`ALTER TABLE users ADD COLUMN deleted_at TEXT`);
  }
  await db.query(
    `INSERT INTO settings (key, value) VALUES ('user_soft_delete_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
};

// ── Entrypoints ───────────────────────────────────────────────────────────────

// Usado por el flujo de setup de Electron (DB nueva → siempre bootstrapea)
export const initDBSchema = async () => {
  bootstrapDB();
  await migrateSalesTimestampsToWindowsLocal();
  await migrateStockAlertStateToTable();
  await backfillMonthlyNumbers();
  await migrateBodegaV1();
  await migrateSalesIdempotencyV1();
  await migrateCategoryArchiveV1();
  await migrateProductArchiveV1();
  await migrateUserSoftDeleteV1();
};

// Usado en cada arranque del servidor
export const initDB = async () => {
  // 1. Bootstrap: salta las ~55 sentencias SQL si la DB ya está inicializada
  bootstrapDB();

  // 2. Seed de admin (retorna inmediatamente si ya existe)
  await seedAdminUser();

  // 3. Leer todos los flags de migración en UNA sola query
  const MIGRATION_KEYS = [
    "timestamp_storage_mode",
    "stock_alert_state_migrated_v2",
    "monthly_numbers_backfilled_v1",
    "bodega_schema_v1",
    "sales_idempotency_v1",
    "product_archive_v1",
    "category_archive_v1",
    "user_soft_delete_v1",
  ];
  const ph = MIGRATION_KEYS.map(() => "?").join(",");
  const { rows: flagRows } = await db.query(
    `SELECT key, value FROM settings WHERE key IN (${ph})`,
    MIGRATION_KEYS
  );
  const flags = Object.fromEntries(flagRows.map((r) => [r.key, r.value]));

  // 4. Ejecutar solo las migraciones pendientes
  if (flags["timestamp_storage_mode"]        !== "windows-local") await migrateSalesTimestampsToWindowsLocal();
  if (flags["stock_alert_state_migrated_v2"] !== "1")             await migrateStockAlertStateToTable();
  if (flags["monthly_numbers_backfilled_v1"] !== "1")             await backfillMonthlyNumbers();
  if (flags["bodega_schema_v1"]              !== "1")             await migrateBodegaV1();
  if (flags["sales_idempotency_v1"]          !== "1")             await migrateSalesIdempotencyV1();
  if (flags["category_archive_v1"]           !== "1")             await migrateCategoryArchiveV1();
  if (flags["product_archive_v1"]            !== "1")             await migrateProductArchiveV1();
  if (flags["user_soft_delete_v1"]           !== "1")             await migrateUserSoftDeleteV1();
};
