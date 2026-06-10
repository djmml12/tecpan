import db from "../config/db.js";
import { enqueueEmail, verifyConnection, resetTransport } from "./email-outbox.service.js";
import { encryptValue, decryptValue } from "../utils/crypto-settings.js";
import logger from "../utils/logger.js";

const EMAIL_CONFIG_KEY          = "email_alert_config";
const STOCK_ALERT_THRESHOLDS_KEY = "stock_alert_thresholds";
const SETTINGS_CACHE_MS = 5_000;

let _configCache = null;
let _configCacheAt = 0;
let _thresholdsCache = null;
let _thresholdsCacheAt = 0;

const getRows = (result) => {
  if (Array.isArray(result)) return result;
  if (result?.rows && Array.isArray(result.rows)) return result.rows;
  return [];
};

// ── Defaults ──────────────────────────────────────────────────────────────────

const defaultConfig = {
  enabled: false,
  lowStockAlerts: true,
  criticalStockAlerts: true,
  includePdfSummary: true,
  smtpHost: "",
  smtpPort: 587,
  secureConnection: false,
  smtpUser: "",
  smtpPassword: "",
  senderName: "TU EMPRESA POS",
  senderEmail: "",
  receiverEmail: "",
  ccEmails: "",
  subjectPrefix: "TU EMPRESA ALERTA",
};

const defaultStockThresholds = { lowStock: 15, criticalStock: 5 };

export function invalidateStockAlertSettingsCache() {
  _configCache = null;
  _configCacheAt = 0;
  _thresholdsCache = null;
  _thresholdsCacheAt = 0;
}

// ── Normalizers ───────────────────────────────────────────────────────────────

const parseJson = (value, fallback = {}) => {
  try { return JSON.parse(value); } catch { return fallback; }
};

const toBool = (value) => value === true || value === "true" || value === 1 || value === "1";

const normalizeConfig = (value = {}) => ({
  ...defaultConfig,
  ...value,
  enabled:             toBool(value.enabled),
  lowStockAlerts:      toBool(value.lowStockAlerts      ?? true),
  criticalStockAlerts: toBool(value.criticalStockAlerts ?? true),
  includePdfSummary:   toBool(value.includePdfSummary   ?? true),
  secureConnection:    toBool(value.secureConnection),
  smtpPort:            Number(value.smtpPort || 587),
});

const normalizeStockThresholds = (value = {}) => {
  const lowStock = Math.max(
    1,
    Number(value.lowStock ?? defaultStockThresholds.lowStock) || defaultStockThresholds.lowStock
  );
  const criticalCandidate = Math.max(
    0,
    Number(value.criticalStock ?? defaultStockThresholds.criticalStock) || defaultStockThresholds.criticalStock
  );
  return { lowStock, criticalStock: Math.min(criticalCandidate, lowStock) };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const getStockThresholds = async () => {
  if (_thresholdsCache && Date.now() - _thresholdsCacheAt < SETTINGS_CACHE_MS) {
    return _thresholdsCache;
  }
  const result = await db.query(`SELECT value FROM settings WHERE key = ?`, [STOCK_ALERT_THRESHOLDS_KEY]);
  const rows   = getRows(result);
  _thresholdsCache = !rows.length || !rows[0]?.value
    ? defaultStockThresholds
    : normalizeStockThresholds(parseJson(rows[0].value, defaultStockThresholds));
  _thresholdsCacheAt = Date.now();
  return _thresholdsCache;
};

const getAlertLevel = (stock, thresholds = defaultStockThresholds) => {
  const s = Number(stock ?? 0);
  if (s <= thresholds.criticalStock) return "critical";
  if (s <= thresholds.lowStock)      return "low";
  return "normal";
};

const buildRecipientList = (config) => {
  const cc = String(config.ccEmails || "")
    .split(",")
    .map(e => e.trim())
    .filter(Boolean);
  return { to: config.receiverEmail, cc };
};

const buildSection = (title, products) => {
  const lines = products.map(p => {
    const cat = p.subcategory ? `${p.category} / ${p.subcategory}` : p.category;
    return `  • ${p.name} (${cat}): stock ${p.stock}`;
  });
  return [title, ...lines].join("\n");
};

// ── State persistence (nueva tabla stock_alert_state) ─────────────────────────

const persistAlertState = async (productId, level) => {
  if (level === "normal") {
    await db.query(`DELETE FROM stock_alert_state WHERE product_id = ?`, [productId]);
  } else {
    await db.query(
      `INSERT INTO stock_alert_state (product_id, level, changed_at)
       VALUES (?, ?, datetime('now', 'localtime'))
       ON CONFLICT(product_id) DO UPDATE SET level = excluded.level, changed_at = excluded.changed_at`,
      [productId, level]
    );
  }
};

const getPrevStates = async (productIds) => {
  if (!productIds.length) return {};
  const ph     = productIds.map(() => "?").join(",");
  const result = await db.query(
    `SELECT product_id, level FROM stock_alert_state WHERE product_id IN (${ph})`,
    productIds
  );
  return getRows(result).reduce((acc, row) => {
    acc[Number(row.product_id)] = row.level;
    return acc;
  }, {});
};

// ── Product query helper ──────────────────────────────────────────────────────

// Para productos de receta, el stock real se calcula desde los insumos, no p.stock.
const EFFECTIVE_STOCK_EXPR = `
  CASE
    WHEN COALESCE(p.tipo_stock, 'directo') = 'receta' THEN
      COALESCE((
        SELECT MAX(0, CAST(MIN(i.stock_actual / r.cantidad_por_porcion) AS INTEGER))
        FROM recetas r
        JOIN insumos i ON i.id = r.insumo_id AND i.activo = 1
        WHERE r.producto_id = p.id AND r.cantidad_por_porcion > 0
      ), 0)
    ELSE p.stock
  END
`;

const PRODUCT_ALERT_SQL = `
  SELECT p.id, p.name,
    (${EFFECTIVE_STOCK_EXPR}) AS stock,
    CASE WHEN parent.id IS NOT NULL THEN parent.name ELSE c.name END AS category,
    CASE WHEN parent.id IS NOT NULL THEN c.name        ELSE ''     END AS subcategory
  FROM products p
  LEFT JOIN categories c      ON c.id      = p.category_id
  LEFT JOIN categories parent ON parent.id = c.parent_id
  WHERE p.is_active = 1
`;

const queryProductsById = async (ids) => {
  const ph     = ids.map(() => "?").join(",");
  const result = await db.query(`${PRODUCT_ALERT_SQL} AND p.id IN (${ph})`, ids);
  return getRows(result).map(r => ({
    id:          Number(r.id),
    name:        r.name,
    stock:       Number(r.stock),
    category:    r.category   || "Sin categoría",
    subcategory: r.subcategory || "",
  }));
};

const queryAllAlertProducts = async (thresholds) => {
  const result = await db.query(
    `${PRODUCT_ALERT_SQL} AND (${EFFECTIVE_STOCK_EXPR}) <= ? ORDER BY (${EFFECTIVE_STOCK_EXPR}) ASC, p.name ASC`,
    [thresholds.lowStock]
  );
  return getRows(result).map(r => ({
    id:          Number(r.id),
    name:        r.name,
    stock:       Number(r.stock),
    category:    r.category   || "Sin categoría",
    subcategory: r.subcategory || "",
  }));
};

// ── Core evaluation logic ─────────────────────────────────────────────────────

async function runEvaluation(products, thresholds, config) {
  const productIds = products.map(p => p.id);
  const prevStates = await getPrevStates(productIds);

  const newCritical  = [];
  const newLow       = [];
  const levelUpdates = []; // [{ id, level }] — se persiste solo si el email se encola OK

  for (const p of products) {
    const newLevel  = getAlertLevel(p.stock, thresholds);
    const prevLevel = prevStates[p.id] || "normal";

    levelUpdates.push({ id: p.id, level: newLevel });

    if (newLevel === "critical" && prevLevel !== "critical") {
      newCritical.push({ ...p, level: "critical" });
    } else if (newLevel === "low" && prevLevel === "normal") {
      newLow.push({ ...p, level: "low" });
    }
  }

  const hasCritical = config.criticalStockAlerts && newCritical.length > 0;
  const hasLow      = config.lowStockAlerts      && newLow.length      > 0;

  if (!hasCritical && !hasLow) {
    logger.info(`[stock-alert] sin transiciones que alertar (evaluados: ${products.length})`);
    // Aún así actualizamos estados para que "normal" quede limpio
    for (const u of levelUpdates) await persistAlertState(u.id, u.level);
    return { sent: false, reason: "no_changes" };
  }

  const sections = [];
  if (hasCritical) sections.push(buildSection("⚠ CRÍTICO — Reponer urgente:", newCritical));
  if (hasLow)      sections.push(buildSection("📉 Bajo — Revisar pronto:",     newLow));

  const subject = newCritical.length > 0
    ? `${config.subjectPrefix} - Stock crítico detectado`
    : `${config.subjectPrefix} - Stock bajo detectado`;

  const body = [
    `Alerta de inventario — ${new Date().toLocaleString()}`,
    "",
    sections.join("\n\n"),
  ].join("\n");

  const recipients = buildRecipientList(config);

  // Persistir estado SOLO después de encolar con éxito —
  // si enqueueEmail falla, la próxima evaluación detecta la transición de nuevo
  await enqueueEmail({ to: recipients.to, cc: recipients.cc, subject, body });
  for (const u of levelUpdates) await persistAlertState(u.id, u.level);

  logger.info(`[stock-alert] email encolado → ${recipients.to} | críticos: ${newCritical.length}, bajos: ${newLow.length}`);
  return { sent: true, queued: 1 };
}

// ── Config validation ─────────────────────────────────────────────────────────

function validateConfig(config) {
  const missing = [];
  if (!config.smtpHost)      missing.push("smtpHost");
  if (!config.smtpUser)      missing.push("smtpUser");
  if (!config.smtpPassword)  missing.push("smtpPassword");
  if (!config.senderEmail)   missing.push("senderEmail");
  if (!config.receiverEmail) missing.push("receiverEmail");
  return missing;
}

// ── Mutex para evaluaciones concurrentes ──────────────────────────────────────

const _pendingIds = new Set();
let   _evalRunning = false;

function runPendingEvaluationSoon() {
  setImmediate(() => {
    evaluateStockAlertsForProducts().catch(err =>
      logger.error(`[stock-alert] error reprogramando evaluación: ${err.message}`)
    );
  });
}

// Evaluador puntual: recibe solo los productos afectados (sale, ajuste, edición)
export async function evaluateStockAlertsForProducts(productIds = []) {
  for (const id of productIds) _pendingIds.add(Number(id));
  if (_evalRunning) return; // Los IDs ya están en el set; el ciclo activo los procesará

  _evalRunning = true;
  try {
    while (_pendingIds.size > 0) {
      const ids = [..._pendingIds];
      _pendingIds.clear();

      const config = await getEmailAlertConfigService();
      if (!config.enabled) { logger.info("[stock-alert] módulo deshabilitado"); break; }

      const missing = validateConfig(config);
      if (missing.length) { logger.warn(`[stock-alert] config incompleta: ${missing.join(", ")}`); break; }

      const thresholds = await getStockThresholds();
      const products   = await queryProductsById(ids);

      if (!products.length) break;

      logger.info(`[stock-alert] evaluando ${products.length} producto(s): [${ids.join(",")}]`);
      await runEvaluation(products, thresholds, config);
    }
  } catch (err) {
    logger.error(`[stock-alert] error en evaluación puntual: ${err.message}`);
  } finally {
    _evalRunning = false;
    if (_pendingIds.size > 0) runPendingEvaluationSoon();
  }
}

// Escaneo completo: para trigger manual y como safety-net
export const processInventoryAlertsService = async () => {
  const config = await getEmailAlertConfigService();
  if (!config.enabled) {
    logger.info("[stock-alert] módulo deshabilitado (enabled=false)");
    return { sent: false, reason: "disabled" };
  }

  const missing = validateConfig(config);
  if (missing.length) {
    logger.warn(`[stock-alert] config incompleta, faltan: ${missing.join(", ")}`);
    return { sent: false, reason: "missing_config" };
  }

  const thresholds = await getStockThresholds();
  const products   = await queryAllAlertProducts(thresholds);

  // Limpiar estados de productos que ya superaron el umbral
  const { rows: stateRows } = await db.query(`SELECT product_id FROM stock_alert_state`);
  const inAlertSet = new Set(products.map(p => p.id));
  for (const row of (stateRows || [])) {
    const id = Number(row.product_id);
    if (!inAlertSet.has(id)) {
      await db.query(`DELETE FROM stock_alert_state WHERE product_id = ?`, [id]);
    }
  }

  if (!products.length) {
    logger.info("[stock-alert] ningún producto bajo umbral");
    return { sent: false, reason: "no_alert_products" };
  }

  logger.info(`[stock-alert] escaneo completo: ${products.length} productos en umbral`);
  return runEvaluation(products, thresholds, config);
};

// ── Exported config services ──────────────────────────────────────────────────

export const getEmailAlertConfigService = async () => {
  if (_configCache && Date.now() - _configCacheAt < SETTINGS_CACHE_MS) {
    return _configCache;
  }
  const result = await db.query(`SELECT value FROM settings WHERE key = ?`, [EMAIL_CONFIG_KEY]);
  const rows   = getRows(result);
  if (!rows.length) {
    _configCache = defaultConfig;
    _configCacheAt = Date.now();
    return _configCache;
  }

  const raw = normalizeConfig(parseJson(rows[0].value, defaultConfig));
  if (raw.smtpPassword) raw.smtpPassword = decryptValue(raw.smtpPassword);
  _configCache = raw;
  _configCacheAt = Date.now();
  return _configCache;
};

export const saveEmailAlertConfigService = async (payload) => {
  const config        = normalizeConfig(payload);
  const configToStore = { ...config };
  if (configToStore.smtpPassword) {
    configToStore.smtpPassword = encryptValue(configToStore.smtpPassword);
  }

  await db.query(
    `INSERT INTO settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [EMAIL_CONFIG_KEY, JSON.stringify(configToStore)]
  );

  _configCache = config;
  _configCacheAt = Date.now();
  resetTransport();

  if (config.enabled && config.smtpHost && config.smtpUser && config.smtpPassword) {
    verifyConnection(config).catch(err =>
      console.warn("[email] SMTP no verificado tras guardar config:", err.message)
    );
  }

  return config;
};

export const sendEmailAlertTestService = async () => {
  const config = await getEmailAlertConfigService();

  if (!config.enabled) throw new Error("Activa el módulo de correo antes de enviar una prueba");

  if (!config.smtpHost || !config.smtpUser || !config.smtpPassword || !config.senderEmail || !config.receiverEmail) {
    throw new Error("Completa la configuración SMTP y los correos requeridos");
  }

  await verifyConnection(config);

  const senderMismatch =
    config.senderEmail &&
    config.smtpUser &&
    config.senderEmail.toLowerCase() !== config.smtpUser.toLowerCase();

  if (senderMismatch) {
    console.warn(
      `[email] senderEmail (${config.senderEmail}) ≠ smtpUser (${config.smtpUser}). ` +
      "Gmail reescribirá el From; correos a Yahoo/Outlook pueden ir a spam."
    );
  }

  const { default: nodemailer } = await import("nodemailer");
  const transport  = nodemailer.createTransport({
    host:              config.smtpHost,
    port:              Number(config.smtpPort || 587),
    secure:            Boolean(config.secureConnection),
    family:            4,
    connectionTimeout: 10_000,
    greetingTimeout:   10_000,
    socketTimeout:     15_000,
    tls: { servername: config.smtpHost },
    auth: { user: config.smtpUser, pass: config.smtpPassword },
  });

  try {
    await transport.sendMail({
      from:    `"${config.senderName}" <${config.senderEmail}>`,
      to:      config.receiverEmail,
      subject: `${config.subjectPrefix} - Prueba de conexión`,
      text: [
        "Prueba de correo desde TU EMPRESA POS.",
        "",
        "La configuración SMTP está funcionando correctamente.",
        `Fecha: ${new Date().toLocaleString()}`,
        senderMismatch
          ? `\nAVISO: El remitente configurado (${config.senderEmail}) es distinto al usuario SMTP (${config.smtpUser}).`
          : "",
      ].join("\n"),
    });
  } finally {
    try { transport.close(); } catch {}
  }

  return { success: true, senderMismatch };
};

export const resetAlertStatesService = async () => {
  await db.query(`DELETE FROM stock_alert_state`);
  // Limpiar también posibles residuos del esquema anterior
  await db.query(`DELETE FROM settings WHERE key LIKE 'email_stock_alert_state_%'`);
  return { reset: true };
};
