import Database from "better-sqlite3";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..", "..");

const electronUserData = process.env.ELECTRON_USER_DATA?.trim();

// Cuando corre dentro de Electron, la ruta de la BD viene de initBackendEnv()
// (main.js) y no debe ser sobreescrita por el .env del repositorio.
if (!electronUserData) {
  dotenv.config({ path: path.join(backendRoot, ".env") });
}

const defaultDbPath = path.join(backendRoot, "data", "fenix.sqlite");
const electronDbPath = electronUserData
  ? path.join(electronUserData, "fenix.sqlite")
  : null;

const normalizeEnvPath = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw.replace(/^['"]|['"]$/g, "");
};

const resolveSqlitePath = () => {
  // Dentro de Electron siempre usamos el directorio de datos del usuario.
  // Esto blinda la ruta y evita que el .env del repo la sobreescriba.
  if (electronDbPath) {
    return electronDbPath;
  }
  // Modo dev/standalone: respetar SQLITE_PATH del entorno o .env
  const rawEnvPath = normalizeEnvPath(process.env.SQLITE_PATH);
  if (rawEnvPath) {
    return path.isAbsolute(rawEnvPath)
      ? rawEnvPath
      : path.resolve(backendRoot, rawEnvPath);
  }
  return defaultDbPath;
};

const sqlitePath = resolveSqlitePath();
fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });

const sqlite = new Database(sqlitePath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("locking_mode = EXCLUSIVE"); // proceso único → sin negociación de locks por escritura
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("synchronous = NORMAL");
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("cache_size = -32000");      // 32 MB de caché en RAM
sqlite.pragma("temp_store = memory");
sqlite.pragma("mmap_size = 134217728");    // 128 MB mmap
sqlite.pragma("wal_autocheckpoint = 1000");

const runQuery = async (executor, text, params = []) => {
  try {
    const sql = String(text || "").trim();
    const normalizedParams = params.map((value) => value instanceof Date ? value.toISOString() : value);
    if (/^(select|pragma|with)\b/i.test(sql)) {
      const stmt = executor.prepare(sql);
      const rows = stmt.all(...normalizedParams);
      return { rows, rowCount: rows.length, lastID: null, changes: 0 };
    }
    const stmt = executor.prepare(sql);
    const result = stmt.run(...normalizedParams);
    return { rows: [], rowCount: Number(result.changes || 0), lastID: Number(result.lastInsertRowid || 0), changes: Number(result.changes || 0) };
  } catch (error) {
    console.error("❌ SQLite error:", error.message, "\nSQL:", text);
    throw error;
  }
};

// Serializa las transacciones: aunque `fn` contenga awaits de I/O real, ninguna
// otra transacción puede empezar entre BEGIN y COMMIT/ROLLBACK. Con una única
// conexión global esto es obligatorio para no solapar BEGIN IMMEDIATE (lo que
// provocaría "cannot start a transaction within a transaction" o cierres cruzados).
let txChain = Promise.resolve();

export const withTransaction = async (fn) => {
  const run = async () => {
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      const result = await fn(sqlite);
      sqlite.exec("COMMIT");
      return result;
    } catch (error) {
      try { sqlite.exec("ROLLBACK"); } catch { /* la tx pudo no haber abierto */ }
      throw error;
    }
  };

  const result = txChain.then(run, run); // encadena pase lo que pase con la previa
  txChain = result.then(() => {}, () => {}); // la cadena nunca queda rechazada
  return result;
};

export const closeDatabase = async () => {
  sqlite.close();
};

export const optimizeDatabase = async () => {
  try {
    sqlite.pragma("optimize");
  } catch {
    // No debe bloquear el arranque ni tumbar el proceso.
  }
};

// Consulta síncrona — solo para checks de arranque en db.init.js
export const querySync = (sql, params = []) => {
  try {
    return sqlite.prepare(sql).all(...params);
  } catch {
    return [];
  }
};

const db = {
  query:       (text, params = [])           => runQuery(sqlite, text, params),
  queryClient: (client, text, params = [])   => runQuery(client, text, params),
  exec:        (sql)                         => sqlite.exec(sql),
};

console.log(`🗄 SQLite → ${sqlitePath}`);

export default db;
