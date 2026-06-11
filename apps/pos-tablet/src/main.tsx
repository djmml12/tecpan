import { createRoot } from "react-dom/client";
import { AuthProvider } from "@pos/auth";
import App from "./app/App";
import { initDisplayScale } from "./services/displayScale";
import "./index.css";

// Aplica la escala de render guardada antes del primer paint.
initDisplayScale();

const root = document.getElementById("root");
if (!root) throw new Error("No se encontró el elemento #root en el DOM");

createRoot(root).render(
  <AuthProvider>
    <App />
  </AuthProvider>
);
