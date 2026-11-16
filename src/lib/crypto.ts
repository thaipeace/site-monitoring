import { createHash, randomBytes } from "node:crypto";

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

/** Public ingest key: 32 hex chars, like a Sentry DSN key. */
export function newPublicKey() {
  return randomBytes(16).toString("hex");
}

/** API token for agents. The `smt_` prefix makes leaked tokens easy to grep for. */
export function newApiToken() {
  return `smt_${randomBytes(24).toString("base64url")}`;
}
