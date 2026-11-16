import { createHash } from "node:crypto";
import { z } from "zod";
import type { EventKind, EventLevel } from "../db/schema";
import { normalizePath, normalizeStack, scrubText } from "./scrub";

/**
 * Ingest contract (SIA-088): an allow-list. Any field not listed here makes the
 * request fail with 400, so nothing unexpected (IP, UA, headers, body, user ids…)
 * can be stored by accident.
 */
export const eventSchema = z
  .object({
    ma_su_kien: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "8–64 ký tự [A-Za-z0-9_-]"),
    thoi_gian: z.iso.datetime({ offset: true }),
    moi_truong: z.string().regex(/^[a-z0-9-]{1,20}$/),
    nguon: z.string().regex(/^[a-z0-9-]{1,30}$/).optional(),
    phien_ban: z.string().max(50).optional(),
    loai_loi: z.string().min(1).max(100).optional(),
    thong_diep: z.string().max(2000).optional(),
    stack: z.union([z.string().max(20_000), z.array(z.string().max(1000)).max(100)]).optional(),
    duong_dan: z.string().max(1000).optional(),
    dau_van_tay: z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/).optional(),
    // Extensions (optional): kind and severity. Default: loi / loi.
    loai: z.enum(["loi", "su_kien", "thong_bao"]).optional(),
    muc_do: z.enum(["nghiem_trong", "loi", "canh_bao", "thong_tin"]).optional(),
  })
  .strict();

export const batchSchema = z.union([
  eventSchema,
  z.array(eventSchema).min(1).max(100),
  z.object({ su_kien: z.array(eventSchema).min(1).max(100) }).strict(),
]);

export type IncomingEvent = z.infer<typeof eventSchema>;

export function toList(body: z.infer<typeof batchSchema>): IncomingEvent[] {
  if (Array.isArray(body)) return body;
  if ("su_kien" in body) return body.su_kien;
  return [body];
}

const KIND: Record<string, EventKind> = { loi: "error", su_kien: "event", thong_bao: "notification" };
const LEVEL: Record<string, EventLevel> = {
  nghiem_trong: "fatal",
  loi: "error",
  canh_bao: "warning",
  thong_tin: "info",
};

export type NormalizedEvent = {
  eventId: string;
  kind: EventKind;
  level: EventLevel;
  environment: string;
  source: string | null;
  release: string | null;
  errorType: string;
  message: string | null;
  stack: string[] | null;
  path: string | null;
  fingerprint: string;
  timestamp: Date;
};

const MAX_MESSAGE = 300;
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

export function normalizeEvent(e: IncomingEvent, now = new Date()): NormalizedEvent {
  const kind = KIND[e.loai ?? "loi"];
  const level = LEVEL[e.muc_do ?? (kind === "error" ? "loi" : "thong_tin")];
  const message = e.thong_diep ? scrubText(e.thong_diep).slice(0, MAX_MESSAGE) : null;
  const stack = normalizeStack(e.stack);
  const path = normalizePath(e.duong_dan);
  const errorType = scrubText(e.loai_loi ?? (kind === "error" ? "Error" : kind)).slice(0, 100);

  // Events far in the future / past get the receive time (bad clocks, replays)
  let timestamp = new Date(e.thoi_gian);
  if (Math.abs(timestamp.getTime() - now.getTime()) > MAX_CLOCK_SKEW_MS) timestamp = now;

  return {
    eventId: e.ma_su_kien,
    kind,
    level,
    environment: e.moi_truong,
    source: e.nguon ?? null,
    release: e.phien_ban ? scrubText(e.phien_ban) : null,
    errorType,
    message,
    stack,
    path,
    fingerprint: e.dau_van_tay
      ? `c:${e.dau_van_tay}`
      : defaultFingerprint({ kind, errorType, message, stack, path, source: e.nguon }),
    timestamp,
  };
}

/**
 * Default grouping when the sender gives no dau_van_tay: error type + route + top frame
 * (file only, so new line numbers in a new release still group together) + message
 * with digits removed.
 */
export function defaultFingerprint(e: {
  kind: string;
  errorType: string;
  message: string | null;
  stack: string[] | null;
  path: string | null;
  source?: string;
}) {
  const topFile = e.stack?.[0]?.replace(/:\d+:\d+$/, "") ?? "";
  const msg = (e.message ?? "").replace(/\d+/g, "0").slice(0, 120);
  const parts = [e.kind, e.source ?? "", e.errorType, e.path ?? "", topFile, topFile ? "" : msg];
  return createHash("sha1").update(parts.join("|")).digest("hex");
}

export function issueTitle(e: NormalizedEvent) {
  return e.message ? `${e.errorType}: ${e.message}`.slice(0, 300) : e.errorType;
}
