import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

process.env.SQLITE_PATH = join(dirname(fileURLToPath(import.meta.url)), "data/tecpancito.sqlite");

const { generateSalesRangeLetter } = await import("./src/utils/pdf/index.js");

const now   = new Date();
const year  = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, "0");
const from  = `${year}-${month}-01`;
const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
const to    = `${year}-${month}-${lastDay}`;

console.log(`Generando reporte ${from} → ${to}...`);
const buf = await generateSalesRangeLetter(from, to);
const out = join(dirname(fileURLToPath(import.meta.url)), "reporte-mensual-preview.pdf");
writeFileSync(out, buf);
console.log(`Guardado en: ${out}`);
