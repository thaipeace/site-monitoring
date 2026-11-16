/**
 * Server-side scrubbing (SIA-088). The sender already filters, but the webapp
 * filters again so a missed case on the client never lands in the database.
 * Every match is replaced by "[an]".
 */

export const MASK = "[an]";

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;
// Vietnamese & international phone numbers: +84 / 84 / 0 prefix, 9–11 digits, optional separators.
const PHONE = /(?<![\w.:/-])(?:\+?84|0)(?:[\s.-]?\d){8,10}(?![\w.:/-])|(?<![\w.:/-])\+\d{1,3}(?:[\s.-]?\d){7,12}(?![\w.:/-])/g;
const AUTH_HEADER = /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{6,}/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g;
// key=value pairs whose key looks secret: token=..., api_key: ..., password=...
const SECRET_PAIR =
  /\b((?:access_?|refresh_?|id_?|api_?|auth_?|session_?)?(?:token|key|secret|password|passwd|pwd|signature|sig))(\s*[=:]\s*)("?)[^\s"&,;]{4,}\3/gi;
// Prefixed API keys (sk_live_…, ghp_…, xoxb-…, re_…, tm_…, smt_…)
const PREFIXED_KEY = /\b(?:sk|pk|rk|tm|smt|re|ghp|gho|ghs|github_pat|xox[abposr]|AKIA)[_-][A-Za-z0-9_-]{8,}/g;
// Long opaque strings that look random (≥ 24 chars mixing letters and digits)
const OPAQUE = /\b(?=[A-Za-z0-9_-]{24,}\b)(?=[A-Za-z_-]*\d)(?=[0-9_-]*[A-Za-z])[A-Za-z0-9_-]{24,}\b/g;
// Query string / fragment after a URL or path
const QUERY = /((?:https?:\/\/|\/)[^\s?#"'<>]*)[?#][^\s"'<>]*/gi;

export function scrubText(value: string): string {
  return value
    .replace(QUERY, "$1")
    .replace(AUTH_HEADER, `$1 ${MASK}`)
    .replace(JWT, MASK)
    .replace(SECRET_PAIR, `$1$2${MASK}`)
    .replace(PREFIXED_KEY, MASK)
    .replace(EMAIL, MASK)
    .replace(PHONE, MASK)
    .replace(OPAQUE, MASK);
}

/** Keeps only `file:line:col` for each frame; drops function names, queries and anything else. */
export function normalizeStack(stack: string | string[] | undefined): string[] | null {
  if (!stack) return null;
  const lines = Array.isArray(stack) ? stack : stack.split("\n");
  const frames: string[] = [];
  const FRAME = /((?:[a-z][a-z0-9+.-]*:\/\/)?[^\s()@'"]+?):(\d+):(\d+)/i;
  for (const line of lines) {
    const m = FRAME.exec(line);
    if (!m) continue;
    const file = scrubText(m[1].replace(/[?#].*$/, ""));
    frames.push(`${file}:${m[2]}:${m[3]}`);
    if (frames.length >= 50) break;
  }
  return frames.length ? frames : null;
}

const ID_SEGMENT =
  /^(?:\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|[A-Za-z0-9_-]{20,})$/i;

/** Route template: drop query/fragment, replace id-like segments with ":id". */
export function normalizePath(path: string | undefined): string | null {
  if (!path) return null;
  const clean = path.replace(/^https?:\/\/[^/]+/i, "").replace(/[?#].*$/, "");
  const templ = clean
    .split("/")
    .map((seg) => (ID_SEGMENT.test(seg) && !seg.startsWith(":") ? ":id" : seg))
    .join("/");
  return scrubText(templ).slice(0, 300) || null;
}
