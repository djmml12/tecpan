import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM  = "aes-256-gcm";
const SALT       = Buffer.from("fenix-pos-settings-v1");
const IV_LEN     = 12;
const TAG_LEN    = 16;
const PREFIX     = "ENC:";

function getKey() {
  // Clave dedicada si existe; si no, JWT_SECRET (compat con datos ya cifrados).
  const secret = process.env.SETTINGS_SECRET || process.env.JWT_SECRET || "fenix-insecure-fallback";
  return scryptSync(secret, SALT, 32);
}

export function encryptValue(text) {
  if (!text || typeof text !== "string") return text;
  if (text.startsWith(PREFIX)) return text; // ya cifrado
  try {
    const key      = getKey();
    const iv       = randomBytes(IV_LEN);
    const cipher   = createCipheriv(ALGORITHM, key, iv);
    const enc      = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    const tag      = cipher.getAuthTag();
    return PREFIX + Buffer.concat([iv, tag, enc]).toString("base64");
  } catch {
    return text;
  }
}

export function decryptValue(encoded) {
  if (!encoded || typeof encoded !== "string") return encoded;
  if (!encoded.startsWith(PREFIX)) return encoded; // sin cifrar (compatibilidad)
  try {
    const key      = getKey();
    const buf      = Buffer.from(encoded.slice(PREFIX.length), "base64");
    const iv       = buf.subarray(0, IV_LEN);
    const tag      = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const enc      = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc).toString("utf8") + decipher.final("utf8");
  } catch {
    return ""; // clave cambiada o dato corrupto
  }
}
