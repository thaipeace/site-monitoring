# Site Monitoring

A standalone, self-hosted, Sentry-like error-monitoring webapp (Next.js 16 + Postgres) for **SIA-088**:
the monitor lives outside Cloudflare (Vercel `sin1` + Neon Singapore) so it does not go down together with the app it watches.

- **Ingest API** `POST /api/ingest`: HMAC-SHA256 signed, **one key per environment** (`that` / `thu` / `dev`, data kept separate), batches (≤100), idempotent on `ma_su_kien`.
- **Allow-list contract**: any field outside the list → 400. The server also masks email / phone number / token-like strings → `[an]`, strips query strings, and keeps only `file:line:col` in stacks.
- **Error grouping** (by `dau_van_tay`, or type + route + top file), hourly roll-ups, **sampling** during error storms (counts stay exact).
- **Statuses**: unresolved / resolved / *resolved in next release* / ignored; automatically reopened when the error comes back (regression).
- **Threshold email alerts** (new error, regression, spike/hour) with an **atomic claim** so no alert is sent twice; optional Slack-compatible webhook.
- **UI** (Vietnamese): overview, error-group list filtered by environment / release / time window, details (chart, stack, history, comments, "copy to create task"), event stream, releases, notifications, project settings, members.
- **AI agents**: API tokens (`smt_…`, scopes `read`/`write`/`admin`, can be restricted to one project) for the **REST API** `/api/v1/*` and the **MCP server** `/api/mcp`.
- Sign-in with email + password, **restricted to `@siroby.com`** (`ALLOWED_EMAIL_DOMAIN`).

## Running locally

```bash
npm install
cp .env.example .env          # set KEY_ENCRYPTION_SECRET, CRON_SECRET
npm run db:dev                # embedded Postgres (no Docker needed) — or: docker compose up -d
npm run db:migrate
npm run dev                   # http://localhost:3000 → register → create project
```

Send a test event (take the key id/secret from Project → Settings):

```bash
GS_URL=http://localhost:3000 GS_KEY_ID=gs_... GS_SECRET=... GS_ENV=thu npm run send-test -- --count 3
```

## Tests

```bash
npm test                      # scrubbing (email/phone/token/query), contract, HMAC, encryption
npm run test:integration      # needs DATABASE_URL: idempotency, grouping, environments, sampling,
                              # regression, resolve-in-next-release, concurrency, atomic alert claim
```

## Deployment (live)

- **Production:** https://site-monitoring-nu.vercel.app — Vercel team `thai-nguyen4`, project `site-monitoring`, functions in `sin1`.
- **Database:** Neon project `lingering-mouse-30987695` (Singapore), branch `production`. `neon.ts` and the git-ignored `.neon` come from `neon init`.
- Driver: `node-postgres` + `attachDatabasePool` (recommended for Vercel Fluid compute). The app uses the pooled `DATABASE_URL`; migrations use `DATABASE_URL_UNPOOLED`.

Pull DB env vars locally: `neon env pull` (or `neon deploy`). Migrate: `npm run db:migrate`.
**Auto-deploy:** the GitHub repo is connected to Vercel — every push to `main` deploys to production; other branches get preview deployments.
Manual redeploy: `vercel deploy --prod` (`.vercelignore` keeps `.env*` from being uploaded).
`vercel.json` pins functions to `sin1` and runs a daily cron at `/api/cron/cleanup` (deletes data past `retentionDays`).

## Sending from a Cloudflare Worker

See the **Integration** page (`/docs`) or the MCP tool `get_integration_guide`: send with `ctx.waitUntil`, a 2 s timeout, a circuit breaker after 3 failures, and a budget of 60 events/minute — when the webapp is slow or down, the app drops events and is never slowed down. Browser errors keep going to the app's own `/api/app/bao-loi`; the Worker filters them before forwarding (CSP unchanged).

## Connecting an AI agent (MCP)

```bash
claude mcp add --transport http site-monitoring https://<app>.vercel.app/api/mcp \
  --header "Authorization: Bearer smt_..."
```

Tools: `list_projects`, `create_project`, `get_integration_guide`, `list_issues`, `get_issue`, `list_issue_events`,
`update_issue_status`, `add_issue_comment`, `list_events`, `list_releases`, `list_notifications`, `mark_notifications_read`.

## Out of scope for the first step (per SIA-088)

Pull channel (calling `/api/app/song`, detecting a silent cron), Tail Worker, cross-monitoring, private sourcemaps.
