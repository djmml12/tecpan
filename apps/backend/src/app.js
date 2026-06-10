import express from "express";
import cors from "cors";
import helmet from "helmet";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import logger from "./utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const distPath   = path.resolve(__dirname, "../../pos-tablet/dist");

const app = express();

const lazyRoute = (loader) => {
  let routePromise = null;
  return async (req, res, next) => {
    try {
      routePromise ??= loader().then((mod) => mod.default);
      const route = await routePromise;
      return route(req, res, next);
    } catch (error) {
      routePromise = null;
      return next(error);
    }
  };
};

app.use(helmet({ contentSecurityPolicy: false }));
// Orígenes locales fijos + cualquier IP de LAN privada (tablets accediendo por IP).
const LAN_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;
app.use(cors({
  origin: (origin, callback) => {
    // Sin Origin (apps nativas, same-origin, curl) o coincide con LAN → permitir.
    if (!origin || LAN_ORIGIN.test(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
}));
app.disable("x-powered-by");
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// Log de peticiones — escribe a archivo con rotación de 7 días
app.use((req, _res, next) => {
  if (req.method === "OPTIONS" || req.originalUrl === "/api/health") {
    next();
    return;
  }
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  logger.req(req.method, req.originalUrl, ip);
  next();
});

app.use("/api/auth",       lazyRoute(() => import("./routes/auth.routes.js")));
app.use("/api/categories", lazyRoute(() => import("./routes/categories.routes.js")));
app.use("/api/products",   lazyRoute(() => import("./routes/products.routes.js")));
app.use("/api/reports",    lazyRoute(() => import("./routes/reports.routes.js")));
app.use("/api/sales",      lazyRoute(() => import("./routes/sales.routes.js")));
app.use("/api/orders",     lazyRoute(() => import("./routes/orders.routes.js")));
app.use("/api/print",      lazyRoute(() => import("./routes/print.routes.js")));
app.use("/api/users",      lazyRoute(() => import("./routes/users.routes.js")));
app.use("/api/roles",      lazyRoute(() => import("./routes/roles.routes.js")));
app.use("/api/settings",   lazyRoute(() => import("./routes/settings.routes.js")));
app.use("/api/bodega",     lazyRoute(() => import("./routes/bodega.routes.js")));

app.get("/api/health", (req, res) => {
  res.json({ status: "OK" });
});

// Servir el frontend compilado si existe el dist
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // SPA fallback: cualquier ruta no-API devuelve index.html
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
} else {
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
    });
  });
}

app.use((err, req, res, _next) => {
  logger.error(`SERVER ERROR: ${err?.stack || err?.message || err}`);

  res.status(500).json({
    success: false,
    message: "Error interno del servidor",
  });
});

export default app;
