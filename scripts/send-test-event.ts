/**
 * Sends a signed test event (or a batch) to the ingest API.
 *
 *   GS_URL=http://localhost:3000 GS_KEY_ID=gs_... GS_SECRET=... GS_ENV=thu npm run send-test
 *   npm run send-test -- --count 5 --type "HTTP 500" --message "D1 timeout"
 */
import "dotenv/config";
import { createHmac, randomBytes } from "node:crypto";

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

async function main() {
  const url = (process.env.GS_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const keyId = process.env.GS_KEY_ID;
  const secret = process.env.GS_SECRET;
  if (!keyId || !secret) throw new Error("Set GS_KEY_ID and GS_SECRET (Project → Settings → Ingest keys)");

  const count = Number(arg("count", "1"));
  const su_kien = Array.from({ length: count }, () => ({
    ma_su_kien: randomBytes(12).toString("hex"),
    thoi_gian: new Date().toISOString(),
    moi_truong: process.env.GS_ENV ?? "thu",
    nguon: arg("source", "may-chu"),
    phien_ban: arg("release", "0.0.1"),
    loai_loi: arg("type", "TypeError"),
    thong_diep: arg("message", "Cannot read properties of undefined (reading 'id')"),
    stack: "at xuLy (may-chu/index.js:120:15)\nat fetch (may-chu/index.js:30:9)",
    duong_dan: arg("path", "/api/app/buoi/:id"),
  }));

  const body = JSON.stringify({ su_kien });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  const res = await fetch(`${url}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-GS-Key": keyId, "X-GS-Timestamp": ts, "X-GS-Signature": sig },
    body,
  });
  console.log(res.status, JSON.stringify(await res.json(), null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
