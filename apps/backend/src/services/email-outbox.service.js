import db from "../config/db.js";
import { decryptValue } from "../utils/crypto-settings.js";
import logger from "../utils/logger.js";

const EMAIL_CONFIG_KEY = "email_alert_config";
const MAX_ATTEMPTS     = 8;
const PURGE_DAYS       = 90;
const SAFETY_NET_MS    = 30_000;

const getRows = (r) => {
  if (Array.isArray(r)) return r;
  if (r?.rows) return r.rows;
  return [];
};

// ── Config reader ─────────────────────────────────────────────────────────────

async function getConfig() {
  const result = await db.query(`SELECT value FROM settings WHERE key = ?`, [EMAIL_CONFIG_KEY]);
  const rows   = getRows(result);
  if (!rows.length || !rows[0]?.value) return null;
  try {
    const config = JSON.parse(rows[0].value);
    if (config?.smtpPassword) config.smtpPassword = decryptValue(config.smtpPassword);
    return config;
  } catch { return null; }
}

// ── Lazy nodemailer ───────────────────────────────────────────────────────────

let _nm;
async function getNm() {
  if (!_nm) _nm = (await import("nodemailer")).default;
  return _nm;
}

// ── Pool transport singleton ──────────────────────────────────────────────────

let _pool       = null;
let _poolKey    = null;

function buildPoolKey(config) {
  return `${config.smtpHost}:${config.smtpPort}:${config.smtpUser}`;
}

async function getPool(config) {
  const nodemailer = await getNm();
  const key = buildPoolKey(config);
  if (_pool && _poolKey === key) return _pool;

  if (_pool) {
    try { _pool.close(); } catch {}
    _pool = null;
  }

  _pool = nodemailer.createTransport({
    pool:            true,
    maxConnections:  1,
    maxMessages:     50,      // recicla conexión cada 50 mensajes
    host:            config.smtpHost,
    port:            Number(config.smtpPort || 587),
    secure:          Boolean(config.secureConnection),
    family:          4,
    socketTimeout:   30_000,
    greetingTimeout: 15_000,
    tls: {
      servername:         config.smtpHost,
      rejectUnauthorized: true,
      minVersion:         "TLSv1.2",
    },
    auth: { user: config.smtpUser, pass: config.smtpPassword },
  });
  _poolKey = key;
  return _pool;
}

export function resetTransport() {
  if (_pool) {
    try { _pool.close(); } catch {}
    _pool    = null;
    _poolKey = null;
  }
}

// ── One-off verify (no pool, cierra sola) ─────────────────────────────────────

export async function verifyConnection(config) {
  const nodemailer = await getNm();
  const t = nodemailer.createTransport({
    host:              config.smtpHost,
    port:              Number(config.smtpPort || 587),
    secure:            Boolean(config.secureConnection),
    family:            4,
    connectionTimeout: 10_000,
    greetingTimeout:   10_000,
    socketTimeout:     15_000,
    tls: {
      servername:         config.smtpHost,
      rejectUnauthorized: true,
      minVersion:         "TLSv1.2",
    },
    auth: { user: config.smtpUser, pass: config.smtpPassword },
  });
  try {
    await t.verify();
  } finally {
    try { t.close(); } catch {}
  }
}

// ── Email format validation ───────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Sanitizar mensajes de error (sin credenciales) ───────────────────────────

function sanitizeErrMsg(err) {
  return String(err?.message || err)
    .slice(0, 500)
    .replace(/pass(?:word)?[=:\s]+\S+/gi, "pass=[redacted]")
    .replace(/auth[=:\s]+[^\s,]+/gi, "auth=[redacted]");
}

// ── Error classification ──────────────────────────────────────────────────────

function isTransient(err) {
  const code = Number(err?.responseCode || 0);
  if (err?.code === "EAUTH") return false;
  const permanentCodes = [550, 551, 552, 553, 554, 555];
  if (permanentCodes.includes(code)) return false;
  const transientCodes = [421, 450, 451, 452, 503];
  if (transientCodes.includes(code)) return true;
  if (code >= 400 && code < 500) return true;
  const netCodes = ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ENOTFOUND", "ESOCKET"];
  if (netCodes.includes(err?.code)) return true;
  return false;
}

// ── Purga de registros antiguos ───────────────────────────────────────────────

async function purgeOldEmails() {
  try {
    const result = await db.query(
      `DELETE FROM email_outbox
       WHERE status IN ('sent', 'failed')
         AND created_at < datetime('now', 'localtime', '-${PURGE_DAYS} days')`
    );
    const deleted = result?.changes || 0;
    if (deleted > 0) logger.info(`[email-outbox] purga: ${deleted} registro(s) eliminado(s) (>${PURGE_DAYS} días)`);
  } catch (err) {
    logger.error(`[email-outbox] error en purga: ${sanitizeErrMsg(err)}`);
  }
}

// ── Worker tick ───────────────────────────────────────────────────────────────

let _tickRunning  = false;
let _tickQueued   = false;
let _workerActive = false;

function requestTick(reason = "wake") {
  if (!_workerActive) return;
  if (_tickRunning) {
    _tickQueued = true;
    return;
  }
  setImmediate(() => {
    tick().catch(e => logger.error(`[email-outbox] ${reason}: ${sanitizeErrMsg(e)}`));
  });
}

async function tick() {
  if (_tickRunning) {
    _tickQueued = true;
    return;
  }
  _tickRunning = true;

  try {
    const config = await getConfig();
    if (!config?.enabled || !config.smtpHost || !config.smtpUser || !config.smtpPassword) return;

    while (true) {
      const result = await db.query(
        `SELECT id, to_addr, cc_addrs, subject, body, attempts
       FROM email_outbox
       WHERE status = 'pending' AND datetime(next_try_at) <= datetime('now', 'localtime')
       ORDER BY created_at ASC
       LIMIT 10`
      );
      const rows = getRows(result);
      if (!rows.length) return;

      const pool = await getPool(config);

      for (const row of rows) {
        let cc = [];
        try { cc = JSON.parse(row.cc_addrs || "[]"); } catch {}

        try {
          await pool.sendMail({
            from:    `"${config.senderName}" <${config.senderEmail}>`,
            to:      row.to_addr,
            cc,
            subject: row.subject,
            text:    row.body,
          });
          await db.query(
            `UPDATE email_outbox SET status = 'sent', sent_at = datetime('now', 'localtime') WHERE id = ?`,
            [row.id]
          );
          logger.info(`[email-outbox] enviado id=${row.id} → ${row.to_addr}`);
        } catch (err) {
          const attempts = Number(row.attempts) + 1;
          const errMsg   = sanitizeErrMsg(err);

          // Invalidar el pool ante errores de autenticación o de red — el próximo tick crea uno nuevo
          const netCodes = ["EAUTH", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ESOCKET"];
          if (netCodes.includes(err?.code)) resetTransport();

          if (!isTransient(err) || attempts >= MAX_ATTEMPTS) {
            await db.query(
              `UPDATE email_outbox SET status = 'failed', attempts = ?, last_error = ? WHERE id = ?`,
              [attempts, errMsg, row.id]
            );
            logger.error(`[email-outbox] fallo permanente id=${row.id}: ${errMsg}`);
          } else {
            const delaySec = Math.min(30 * Math.pow(2, attempts - 1), 3600);
            await db.query(
              `UPDATE email_outbox SET attempts = ?, last_error = ?, next_try_at = datetime('now', 'localtime', '+${delaySec} seconds') WHERE id = ?`,
              [attempts, errMsg, row.id]
            );
            logger.warn(`[email-outbox] transitorio id=${row.id} intento=${attempts}, reintento en ${delaySec}s: ${errMsg}`);
          }
        }
      }
    }
  } finally {
    _tickRunning = false;
    if (_tickQueued) {
      _tickQueued = false;
      requestTick("queued tick");
    }
  }
}

// ── Encolar y despertar al worker de inmediato ────────────────────────────────

export async function enqueueEmail({ to, cc = [], subject, body }) {
  if (!to || !EMAIL_RE.test(String(to).trim())) {
    throw new Error(`Dirección de correo inválida: "${to}"`);
  }
  const cleanSubject = String(subject || "").replace(/[\r\n]+/g, " ");
  await db.query(
    `INSERT INTO email_outbox (to_addr, cc_addrs, subject, body)
     VALUES (?, ?, ?, ?)`,
    [String(to).trim(), JSON.stringify(cc), cleanSubject, body]
  );

  // Despertar al worker sin esperar — el correo sale en ~ms en lugar de esperar el próximo tick
  requestTick("wake tick");
}

// ── Worker lifecycle ──────────────────────────────────────────────────────────

let _timer = null;

export async function startOutboxWorker() {
  if (_timer) return;
  _workerActive = true;

  getConfig().then(config => {
    if (config?.enabled && config.smtpHost && config.smtpUser && config.smtpPassword) {
      verifyConnection(config)
        .then(() => logger.info("[email-outbox] SMTP verificado correctamente al iniciar"))
        .catch(err => logger.error(`[email-outbox] SMTP NO verificado al iniciar: ${sanitizeErrMsg(err)}`));
    }
  }).catch(() => {});

  purgeOldEmails();

  // Safety-net cada 30 s por si algún wake se perdió
  _timer = setInterval(
    () => tick().catch(e => logger.error(`[email-outbox] tick: ${sanitizeErrMsg(e)}`)),
    SAFETY_NET_MS
  );
  requestTick("startup tick");
  logger.info("📧 Email outbox worker iniciado (pool SMTP, wake inmediato, safety-net 30s)");
}

export function stopOutboxWorker() {
  _workerActive = false;
  if (_timer) { clearInterval(_timer); _timer = null; }
  resetTransport();
}
