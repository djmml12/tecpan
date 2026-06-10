import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { existsSync } from "fs";

const __dir = dirname(fileURLToPath(import.meta.url));

// Ruta al logo naranja (relativa a este archivo → raíz del repo)
const LOGO_PATH = join(__dir, "../../../../../apps/pos-tablet/public/icons/icon.svg");

export const logoExists = existsSync(LOGO_PATH);

/**
 * Dibuja el logo naranja en el documento pdfkit.
 * Si el archivo no existe, escribe "TECPANCITO" en amarillo como fallback.
 *
 * @param {PDFDocument} doc
 * @param {number} x
 * @param {number} y
 * @param {number} w  ancho máximo
 * @param {number} h  alto máximo
 */
export function drawLogo(doc, x, y, w, h) {
  if (logoExists) {
    try {
      doc.image(LOGO_PATH, x, y, { fit: [w, h] });
      return;
    } catch {
      // fallback a texto si la imagen falla
    }
  }
  doc.save()
     .fillColor("#F0B017")
     .font("Helvetica-Bold")
     .fontSize(14)
     .text("TECPANCITO", x, y + (h - 14) / 2, { width: w, align: "left", lineBreak: false })
     .restore();
}
