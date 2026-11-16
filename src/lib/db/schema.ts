import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const projectRole = pgEnum("project_role", ["owner", "admin", "member"]);
/** error = grouped into issues; event / notification = activity stream only. */
export const eventKind = pgEnum("event_kind", ["error", "event", "notification"]);
export const eventLevel = pgEnum("event_level", ["fatal", "error", "warning", "info"]);
export const issueStatus = pgEnum("issue_status", ["unresolved", "resolved", "ignored"]);

/* ------------------------------------------------------------------ users */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    // sha256 of the session cookie value
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/* --------------------------------------------------------------- projects */

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  // Monotonic counter used to build short ids like "SIROBY-42"
  issueCounter: integer("issue_counter").notNull().default(0),

  // Alerting (email via Resend + optional Slack-compatible webhook)
  alertEmails: text("alert_emails"),
  webhookUrl: text("webhook_url"),
  // Comma separated environments that trigger alerts (dev is usually noise)
  alertEnvironments: text("alert_environments").notNull().default("that,thu"),
  alertOnNewIssue: boolean("alert_on_new_issue").notNull().default(true),
  alertOnRegression: boolean("alert_on_regression").notNull().default(true),
  // Spike alert: an issue reaching this many events within the current hour (0 = off)
  alertThresholdPerHour: integer("alert_threshold_per_hour").notNull().default(50),
  // An issue alerts at most once per cooldown window
  alertCooldownMinutes: integer("alert_cooldown_minutes").notNull().default(60),
  alertOnNotification: boolean("alert_on_notification").notNull().default(false),

  // Storm protection: max full events stored per issue per hour (counts stay exact)
  sampleLimitPerHour: integer("sample_limit_per_hour").notNull().default(50),
  retentionDays: integer("retention_days").notNull().default(30),
  createdAt: createdAt(),
});

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: projectRole("role").notNull().default("member"),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    index("project_members_user_idx").on(t.userId),
  ],
);

/**
 * Ingest keys. One per environment (that / thu / dev): the environment of an event
 * comes from the key that signed it, which keeps environments' data separated.
 * Requests are signed with HMAC-SHA256 using `secret` (stored AES-GCM encrypted).
 */
export const ingestKeys = pgTable(
  "ingest_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    environment: text("environment").notNull(),
    // Public identifier sent in the X-GS-Key header
    keyId: text("key_id").notNull().unique(),
    secretEnc: text("secret_enc").notNull(),
    lastUsedAt: ts("last_used_at"),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [index("ingest_keys_project_idx").on(t.projectId)],
);

/** Personal API tokens used by AI agents / scripts to read & manage data. */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // sha256 of the full token; the plain token is only shown once
    tokenHash: text("token_hash").notNull().unique(),
    prefix: text("prefix").notNull(),
    scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
    // Optional restriction to a single project
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    lastUsedAt: ts("last_used_at"),
    expiresAt: ts("expires_at"),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [index("api_tokens_user_idx").on(t.userId)],
);

/* ------------------------------------------------------- issues & events */

export const issues = pgTable(
  "issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    environment: text("environment").notNull(),
    shortId: integer("short_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    errorType: text("error_type").notNull(),
    title: text("title").notNull(),
    // Route template or top stack frame
    culprit: text("culprit"),
    source: text("source"),
    level: eventLevel("level").notNull().default("error"),
    status: issueStatus("status").notNull().default("unresolved"),
    eventCount: integer("event_count").notNull().default(0),
    firstSeen: ts("first_seen").notNull(),
    lastSeen: ts("last_seen").notNull(),
    firstRelease: text("first_release"),
    lastRelease: text("last_release"),
    resolvedAt: ts("resolved_at"),
    // Set by "resolve in next release": only events from releases first seen
    // after resolvedAt reopen the issue; older releases still in flight do not.
    resolvedInNextRelease: boolean("resolved_in_next_release").notNull().default(false),
    // Atomic alert claim: only the request that moves this forward sends the alert
    lastAlertedAt: ts("last_alerted_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("issues_project_env_fp_uq").on(t.projectId, t.environment, t.fingerprint),
    uniqueIndex("issues_project_short_id_uq").on(t.projectId, t.shortId),
    index("issues_project_status_last_seen_idx").on(t.projectId, t.status, t.lastSeen),
  ],
);

/**
 * Only the fields in the SIA-088 allow-list are stored. There is deliberately no
 * column for IP, user agent, headers, cookies, body, query string or user data.
 */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(), // ma_su_kien
    kind: eventKind("kind").notNull().default("error"),
    level: eventLevel("level").notNull().default("error"),
    environment: text("environment").notNull(), // moi_truong
    source: text("source"), // nguon
    release: text("release"), // phien_ban
    errorType: text("error_type"), // loai_loi
    message: text("message"), // thong_diep
    stack: jsonb("stack").$type<string[]>(), // stack: "file:line:col" frames
    path: text("path"), // duong_dan
    fingerprint: text("fingerprint"), // dau_van_tay
    timestamp: ts("timestamp").notNull(), // thoi_gian
    receivedAt: ts("received_at").notNull().defaultNow(),
    // Only for kind = notification (inbox read state)
    readAt: ts("read_at"),
  },
  (t) => [
    uniqueIndex("events_project_env_event_id_uq").on(t.projectId, t.environment, t.eventId),
    index("events_issue_ts_idx").on(t.issueId, t.timestamp),
    index("events_project_kind_ts_idx").on(t.projectId, t.kind, t.timestamp),
  ],
);

/**
 * Idempotency receipts: one row per (project, environment, ma_su_kien), kept for the
 * retention period. Separate from `events` because sampled-out events have no row there.
 */
export const eventReceipts = pgTable(
  "event_receipts",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    environment: text("environment").notNull(),
    eventId: text("event_id").notNull(),
    receivedAt: ts("received_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.environment, t.eventId] }),
    index("event_receipts_received_idx").on(t.receivedAt),
  ],
);

/**
 * Hourly roll-up per issue. Every event increments its bucket even when the full
 * event is dropped by sampling, so counts and charts stay exact during error storms.
 */
export const issueHourly = pgTable(
  "issue_hourly",
  {
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    hour: ts("hour").notNull(),
    count: integer("count").notNull().default(0),
    stored: integer("stored").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.issueId, t.hour] }),
    index("issue_hourly_project_hour_idx").on(t.projectId, t.hour),
  ],
);

export const releases = pgTable(
  "releases",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    environment: text("environment").notNull(),
    version: text("version").notNull(),
    firstSeen: ts("first_seen").notNull().defaultNow(),
    lastSeen: ts("last_seen").notNull().defaultNow(),
    eventCount: integer("event_count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.environment, t.version] })],
);

export const issueComments = pgTable(
  "issue_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    // Set when the comment was posted by an AI agent through an API token
    viaTokenName: text("via_token_name"),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("issue_comments_issue_idx").on(t.issueId)],
);

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Issue = typeof issues.$inferSelect;
export type Event = typeof events.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
export type IngestKey = typeof ingestKeys.$inferSelect;
export type ProjectRole = (typeof projectRole.enumValues)[number];
export type EventKind = (typeof eventKind.enumValues)[number];
export type EventLevel = (typeof eventLevel.enumValues)[number];
export type IssueStatus = (typeof issueStatus.enumValues)[number];
