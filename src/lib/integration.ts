/** Integration guide shared by the /docs page and the MCP `get_integration_guide` tool. */

export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const CONTRACT_FIELDS: { field: string; required: boolean; note: string }[] = [
  { field: "ma_su_kien", required: true, note: "Random id, 8–64 chars [A-Za-z0-9_-]. Re-sending the same id counts once." },
  { field: "thoi_gian", required: true, note: "ISO 8601 UTC timestamp of the error (sender clock)." },
  { field: "moi_truong", required: true, note: "that / thu / dev — must match the environment of the signing key." },
  { field: "nguon", required: false, note: "may-chu / cron / thu / trinh-duyet (a-z0-9-, ≤30)." },
  { field: "phien_ban", required: false, note: "Release, e.g. 2.51.0." },
  { field: "loai_loi", required: false, note: "TypeError, HTTP 500, D1_ERROR… (≤100)." },
  { field: "thong_diep", required: false, note: "Filtered message; truncated to 300 chars server-side." },
  { field: "stack", required: false, note: "String or array; only file:line:col is kept." },
  { field: "duong_dan", required: false, note: "Route template like /api/app/buoi/:id; query string dropped." },
  { field: "dau_van_tay", required: false, note: "Grouping hash. If absent: type + route + top file." },
  { field: "loai", required: false, note: "Extension: loi (default) / su_kien / thong_bao." },
  { field: "muc_do", required: false, note: "Extension: nghiem_trong / loi (default) / canh_bao / thong_tin." },
];

export const NEVER_SEND =
  "IP, country/city, User-Agent, cookies, headers, request body, query strings, device ids, ph_id / be_id, names, e-mails, phone numbers.";

export function workerSnippet(opts: { keyIdVar?: string; secretVar?: string } = {}) {
  const k = opts.keyIdVar ?? "GS_KEY_ID";
  const s = opts.secretVar ?? "GS_SECRET";
  return `// giam-sat.js — send errors to Site Monitoring from a Cloudflare Worker.
// Never blocks the app: ctx.waitUntil + short timeout + circuit breaker + budget.
const GS_URL = "${appUrl()}/api/ingest";
const TIMEOUT_MS = 2000;
const MAX_PER_MINUTE = 60;        // budget per isolate
let breakerUntil = 0, failures = 0, windowStart = 0, sentInWindow = 0;

async function hmacHex(secret, data) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function baoLoi(env, ctx, suKien /* array of allow-listed objects */) {
  const now = Date.now();
  if (now < breakerUntil) return;                       // breaker open: drop
  if (now - windowStart > 60_000) { windowStart = now; sentInWindow = 0; }
  if (sentInWindow >= MAX_PER_MINUTE) return;           // over budget: drop
  sentInWindow += suKien.length;

  ctx.waitUntil((async () => {
    try {
      const body = JSON.stringify({ su_kien: suKien });
      const ts = String(Math.floor(now / 1000));
      const res = await fetch(GS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-GS-Key": env.${k},
          "X-GS-Timestamp": ts,
          "X-GS-Signature": await hmacHex(env.${s}, ts + "." + body),
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status >= 500) throw new Error("HTTP " + res.status);
      failures = 0;
    } catch {
      if (++failures >= 3) { breakerUntil = Date.now() + 5 * 60_000; failures = 0; }
    }
  })());
}

// Example: in the global catch of the Worker
// baoLoi(env, ctx, [{
//   ma_su_kien: crypto.randomUUID(),
//   thoi_gian: new Date().toISOString(),
//   moi_truong: env.MOI_TRUONG,            // "that" | "thu" | "dev"
//   nguon: "may-chu",
//   phien_ban: env.PHIEN_BAN,
//   loai_loi: err.name || "Error",
//   thong_diep: String(err.message).slice(0, 300),
//   stack: err.stack,
//   duong_dan: "/api/app/buoi/:id",
// }]);`;
}

export function nodeSnippet() {
  return `import { createHmac, randomUUID } from "node:crypto";

export async function baoLoi(err, extra = {}) {
  const body = JSON.stringify({ su_kien: [{
    ma_su_kien: randomUUID(),
    thoi_gian: new Date().toISOString(),
    moi_truong: process.env.GS_ENV,         // must match the key's environment
    nguon: "may-chu",
    phien_ban: process.env.APP_VERSION,
    loai_loi: err.name ?? "Error",
    thong_diep: String(err.message ?? err).slice(0, 300),
    stack: err.stack,
    ...extra,
  }] });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", process.env.GS_SECRET).update(ts + "." + body).digest("hex");
  await fetch("${appUrl()}/api/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-GS-Key": process.env.GS_KEY_ID,
               "X-GS-Timestamp": ts, "X-GS-Signature": sig },
    body,
    signal: AbortSignal.timeout(2000),
  }).catch(() => {});                       // never let monitoring break the app
}`;
}

export function curlSnippet() {
  return `BODY='{"ma_su_kien":"test-'$(date +%s)'","thoi_gian":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","moi_truong":"thu","loai_loi":"HTTP 500","thong_diep":"hello"}'
TS=$(date +%s)
SIG=$(printf '%s' "$TS.$BODY" | openssl dgst -sha256 -hmac "$GS_SECRET" | sed 's/^.* //')
curl -X POST ${appUrl()}/api/ingest \\
  -H "Content-Type: application/json" -H "X-GS-Key: $GS_KEY_ID" \\
  -H "X-GS-Timestamp: $TS" -H "X-GS-Signature: $SIG" -d "$BODY"`;
}

export function mcpConfigSnippet() {
  return JSON.stringify(
    {
      mcpServers: {
        "site-monitoring": {
          type: "http",
          url: `${appUrl()}/api/mcp`,
          headers: { Authorization: "Bearer smt_..." },
        },
      },
    },
    null,
    2,
  );
}

export function integrationGuideText(project?: { slug: string; keys: { environment: string; keyId: string }[] }) {
  const lines = [
    `# Sending errors to Site Monitoring`,
    ``,
    `Endpoint: POST ${appUrl()}/api/ingest`,
    `Headers: X-GS-Key (key id), X-GS-Timestamp (unix seconds), X-GS-Signature = hex(HMAC-SHA256(secret, timestamp + "." + rawBody))`,
    `Timestamp must be within ±300s. Body: one event, an array, or {"su_kien": [...]} (max 100). Response 202 with per-event status (accepted / duplicate / rejected).`,
    `One key per environment: the key decides the environment and data is separated per environment.`,
    ``,
    `## Allowed fields (anything else → HTTP 400)`,
    ...CONTRACT_FIELDS.map((f) => `- ${f.field}${f.required ? " (required)" : ""}: ${f.note}`),
    ``,
    `Never send: ${NEVER_SEND}`,
    `The server additionally masks e-mails, phone numbers and token-like strings as "[an]".`,
  ];
  if (project) {
    lines.push(``, `## Keys for project "${project.slug}"`);
    for (const k of project.keys) lines.push(`- ${k.environment}: key id ${k.keyId} (secret: ask a project admin / Settings → Ingest keys)`);
  }
  lines.push(``, `## Cloudflare Worker example`, "```js", workerSnippet(), "```", ``, `## Node.js example`, "```js", nodeSnippet(), "```");
  return lines.join("\n");
}
