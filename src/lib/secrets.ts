import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** AES-256-GCM for ingest-key secrets at rest. Key derived from KEY_ENCRYPTION_SECRET. */
function key() {
  const secret = process.env.KEY_ENCRYPTION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("KEY_ENCRYPTION_SECRET must be set (at least 16 characters)");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function decryptSecret(payload: string) {
  const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export const SIGNATURE_WINDOW_SECONDS = 300;

/** Signature = hex(HMAC-SHA256(secret, `${timestamp}.${rawBody}`)) */
export function signBody(secret: string, timestamp: string, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verifySignature(
  secret: string,
  timestamp: string,
  body: string,
  signature: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): { ok: true } | { ok: false; reason: string } {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "invalid timestamp" };
  if (Math.abs(nowSeconds - ts) > SIGNATURE_WINDOW_SECONDS) {
    return { ok: false, reason: "timestamp outside the allowed window" };
  }
  const expected = Buffer.from(signBody(secret, timestamp, body), "hex");
  const given = Buffer.from(signature.replace(/^sha256=/, ""), "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "invalid signature" };
  }
  return { ok: true };
}
