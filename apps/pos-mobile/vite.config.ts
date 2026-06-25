import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const certPath = path.resolve(__dirname, "../backend/cert.pem");
const keyPath  = path.resolve(__dirname, "../backend/key.pem");
const hasCerts = fs.existsSync(certPath) && fs.existsSync(keyPath);
const httpsOpts = hasCerts ? { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) } : undefined;

export default defineConfig({
  base: process.env.BASE_PATH ?? "./",

  plugins: [react()],

  resolve: {
    alias: {
      "@pos/ui-kit":     path.resolve(__dirname, "../../packages/ui-kit/src"),
      "@pos/types":      path.resolve(__dirname, "../../packages/types/src"),
      "@pos/api-client": path.resolve(__dirname, "../../packages/api-client/src"),
      "@pos/auth":       path.resolve(__dirname, "../../packages/auth/src"),
      "@pos/pos-core":   path.resolve(__dirname, "../../packages/pos-core/src"),
    },
  },

  server: {
    host: "0.0.0.0",
    port: 5174,
    https: httpsOpts,
    proxy: {
      "/api": {
        target: hasCerts ? "https://127.0.0.1:3000" : "http://127.0.0.1:3000",
        changeOrigin: true,
        secure: false,
      },
    },
  },

  preview: {
    host: "0.0.0.0",
    port: 4174,
  },
});
