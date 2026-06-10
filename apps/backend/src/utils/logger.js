import fs from "fs";
import fsP from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, "..", "..", "logs");
const MAX_LOG_DAYS = 7;
const LOG_FLUSH_INTERVAL_MS = 500;
const MAX_BUFFERED_LINES = 1000;

fs.mkdirSync(LOG_DIR, { recursive: true });

let buffer = [];
let flushTimer = null;
let flushing = false;

function getLogPath() {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `pos-${date}.log`);
}

function flushSync() {
  if (!buffer.length) return;
  const chunk = buffer.join("");
  buffer = [];
  try {
    fs.appendFileSync(getLogPath(), chunk, "utf8");
  } catch {
    // si falla escritura en disco, no matar el proceso
  }
}

async function flushAsync() {
  if (flushing || !buffer.length) return;
  flushing = true;
  const chunk = buffer.join("");
  buffer = [];
  try {
    await fsP.appendFile(getLogPath(), chunk, "utf8");
  } catch {
    // si falla escritura en disco, no matar el proceso
  } finally {
    flushing = false;
    if (buffer.length) scheduleFlush();
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushAsync();
  }, LOG_FLUSH_INTERVAL_MS);
  flushTimer.unref?.();
}

function write(level, msg) {
  const line = `${new Date().toISOString()} [${level}] ${msg}\n`;
  buffer.push(line);
  if (buffer.length > MAX_BUFFERED_LINES) {
    const dropped = buffer.length - MAX_BUFFERED_LINES + 1;
    buffer.splice(0, dropped);
    buffer.unshift(`${new Date().toISOString()} [WARN] Log buffer lleno; se descartaron ${dropped} lineas antiguas\n`);
  }
  if (level === "ERROR") {
    flushSync();
  } else {
    scheduleFlush();
  }
  if (level === "ERROR") process.stderr.write(line);
}

function rotateLogs() {
  try {
    const cutoff = Date.now() - MAX_LOG_DAYS * 24 * 60 * 60 * 1000;
    for (const f of fs.readdirSync(LOG_DIR)) {
      const full = path.join(LOG_DIR, f);
      if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
    }
  } catch {
    // rotación falla silenciosamente
  }
}

// Rotar al iniciar y cada 24h
rotateLogs();
setInterval(rotateLogs, 24 * 60 * 60 * 1000).unref();
process.on("beforeExit", flushSync);
process.on("exit", flushSync);

const logger = {
  info:  (msg) => write("INFO",  msg),
  warn:  (msg) => write("WARN",  msg),
  error: (msg) => write("ERROR", msg),
  req:   (method, url, ip) => write("REQ", `${method} ${url} | IP: ${ip}`),
};

export default logger;
