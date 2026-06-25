import "dotenv/config";
import app from "./app.js";
import { initDB } from "./config/db.init.js";
import { closeDatabase, optimizeDatabase } from "./config/db.js";
import logger from "./utils/logger.js";

if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET no está configurado en .env — el servidor no puede arrancar de forma segura.");
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
let shuttingDown = false;
let stopOutboxWorker = () => {};

async function startOutboxWorkerAfterListen() {
  try {
    const outbox = await import("./services/email-outbox.service.js");
    stopOutboxWorker = outbox.stopOutboxWorker;
    await outbox.startOutboxWorker();
  } catch (error) {
    logger.error(`No se pudo iniciar el worker de correo: ${error?.stack || error}`);
  }
}

async function startServer() {
  try {
    console.log("🟢 Iniciando servidor...");

    await initDB();

    const server = await new Promise((resolve, reject) => {
      const s = app.listen(PORT, HOST, () => {
        console.log("🔥 SERVER CORRECTO EJECUTÁNDOSE 🔥");
        console.log(`🔥 Backend POS corriendo en ${HOST}:${PORT}`);
        console.log(`🌐 http://localhost:${PORT}`);
        resolve(s);
      });
      s.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
          console.error(`❌ El puerto ${PORT} ya está en uso. Cierra otras instancias del sistema y vuelve a abrir.`);
          logger.error(`Puerto ${PORT} en uso (EADDRINUSE) — el backend no pudo arrancar.`);
        }
        reject(err);
      });
    });

    server.requestTimeout  = 30000;
    server.headersTimeout  = 35000;
    server.keepAliveTimeout = 15000;

    setImmediate(() => { void startOutboxWorkerAfterListen(); });
    setTimeout(() => { void optimizeDatabase(); }, 3000).unref();

    const shutdown = (signal = "manual") => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log("\n🛑 Cerrando servidor...");

      server.close(async () => {
        try {
          stopOutboxWorker();
          await closeDatabase();
        } catch (error) {
          console.error("❌ Error cerrando base de datos:", error);
        }
        console.log(`✅ Servidor detenido correctamente (${signal})`);
        process.exit(0);
      });

      setTimeout(() => {
        console.error("⚠️ Cierre forzado por timeout después de 30s");
        process.exit(1);
      }, 30000).unref();
    };

    process.on("SIGINT",  () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    process.on("unhandledRejection", (reason) => {
      logger.error(`Unhandled Rejection: ${reason?.stack || reason}`);
    });

    process.on("uncaughtException", (error) => {
      logger.error(`Uncaught Exception: ${error?.stack || error}`);
    });
  } catch (error) {
    console.error("❌ Error iniciando servidor:", error);
    process.exit(1);
  }
}

startServer();
