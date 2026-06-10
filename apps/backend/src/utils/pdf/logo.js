import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { existsSync } from "fs";

const __dir = dirname(fileURLToPath(import.meta.url));

// Ruta al logo naranja (relativa a este archivo → raíz del repo)
const LOGO_PATH = join(__dir, "../../../../../logos fenix/VERSIÓN-UN-SOLO-COLOR-NARANJA.png");

export const logoExists = existsSync(LOGO_PATH);

/**
 * Dibuja el logo naranja en el documento pdfkit.
 * Si el archivo no existe, escribe "TECPANCITO" en naranja como fallback.
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
  // Calcula tamaño que cabe en el ancho dado (Helvetica-Bold ≈ 0.63pt/char por pt de fontSize)
  const fs = Math.min(Math.round(h * 0.7), Math.floor(w / 6.3));
  doc.save()
     .fillColor("#E97316")
     .font("Helvetica-Bold")
     .fontSize(fs)
     .text("TECPANCITO", x, y + (h - fs) * 0.5, { width: w, align: "left", lineBreak: false })
     .restore();
}
