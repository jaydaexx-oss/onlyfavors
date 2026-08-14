import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEY_BYTES = 32;

function readKey(): Buffer | null {
  const raw = process.env.LOCATION_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  const hex = Buffer.from(raw, "hex");
  if (hex.length === KEY_BYTES) return hex;
  const utf = Buffer.from(raw, "utf8");
  if (utf.length === KEY_BYTES) return utf;
  return null;
}

export function locationEncryptionReady(): boolean {
  return Boolean(readKey());
}

export function encryptExactLocation(payload: { lat: number; lng: number }): string {
  const key = readKey();
  if (!key) throw new Error("LOCATION_ENCRYPTION_KEY is not configured");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = JSON.stringify({ lat: payload.lat, lng: payload.lng });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptExactLocation(ciphertext: string): { lat: number; lng: number } {
  const key = readKey();
  if (!key) throw new Error("LOCATION_ENCRYPTION_KEY is not configured");
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  const parsed = JSON.parse(plaintext) as { lat: number; lng: number };
  return { lat: Number(parsed.lat), lng: Number(parsed.lng) };
}
