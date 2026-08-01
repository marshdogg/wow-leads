# WOW Leads

WOW Leads is the pre-Funnel half of WOW OS: everything that happens *before* an estimate is booked.

It runs four lead pipelines on one shared Account/Contact model, lets AI agents draft touchpoints on a
schedule, requires a human to approve every one of them, lets field reps log outcomes by voice or one tap,
and hands a deal off into the existing WOW OS Funnel the moment it becomes a scheduled estimate.

## The signature flow

The whole product is one story, and it works end to end:

1. The **11-month trigger** fires — a job completed eleven months ago with no contact since.
2. An **AI agent drafts** the touchpoint, with a "why this fired" payload built from record facts.
3. A **human approves** it in the Approvals queue. Nothing is ever sent without that.
4. A **rep logs the outcome** in the field — one tap, or by speaking it and letting the parser structure it.
5. The **Account record** shows the full provenance timeline: which agent, which person, when.
6. The deal **books**, and appears in the WOW OS Funnel as **"Estimate Scheduled"** with its `EST-#####` ref.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind v4 · Drizzle ORM on Neon Postgres ·
Zod · nuqs · Zustand (UI state only) · lucide-react · Vitest + Playwright · deployed on Vercel.

## Local setup

Requires Node 20+, pnpm, and a Neon Postgres database (the free tier is plenty).

```bash
pnpm install
cp .env.example .env.local     # then fill in DATABASE_URL and DATABASE_URL_UNPOOLED
pnpm db:migrate                # creates the schema
pnpm seed                      # loads the demo dataset the prototype was designed against
pnpm dev                       # http://localhost:3000
```

`ANTHROPIC_API_KEY` is **optional**. Leave it blank and the app is fully usable: the touchpoint drafter and
the voice-note parser each ship a deterministic template/regex implementation and fall back to it whenever
the key is unset. That template path is the real path, not a degraded stub — it renders the reference copy
from record facts. Setting the key upgrades drafting to Claude; the implementation is chosen per call by key
presence, so it takes a restart rather than a redeploy, and any API error or output that fails validation
falls back to the template. A bad key degrades, it does not break.

`CRON_SECRET` is required even locally — see the deployment section.

`GET /api/health` returns a row count per table — the fastest way to confirm the migration and seed landed.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Dev server. `NEXT_DIST_DIR` overrides the build directory so several can run at once. |
| `pnpm build` / `pnpm start` | Production build and serve. |
| `pnpm typecheck` | `tsc --noEmit`. |
| `pnpm lint` | ESLint. |
| `pnpm format` | Prettier over the repo. |
| `pnpm db:generate` | Generate a migration from `db/schema.ts` after you change it. |
| `pnpm db:migrate` | Apply pending migrations (uses `DATABASE_URL_UNPOOLED`). |
| `pnpm db:push` | Push the schema straight to the database, skipping migration files. Dev only. |
| `pnpm seed` | Load the demo dataset. Idempotent — safe to re-run. |
| `pnpm test` | Unit tests (Vitest). |
| `pnpm test:watch` | Unit tests in watch mode. |
| `pnpm test:e2e` | Playwright. Builds and starts the app itself unless `PLAYWRIGHT_BASE_URL` is set. |

## Architecture

**Reads are RSC, writes are Server Actions.** Pages are async server components that call repositories
directly — no API layer in between, no client-side fetching for initial data. Mutations are server actions
in `app/actions/*`, each Zod-validated at its boundary and each ending in `revalidatePath`. The handful of
routes under `app/api/` exist for things that genuinely need an HTTP endpoint: the cron trigger, health, and
a read-only JSON view of deals and pipelines.

**The repository layer owns the database.** Everything in `lib/repositories/` returns domain types from
`lib/types.ts`; no component or action writes SQL or touches Drizzle. Every mutation writes an
`audit_events` row alongside the change, so who or what altered a deal is always recoverable — that audit
trail is what the Record screen's provenance timeline reads.

**Pipelines are data, not code.** `lib/pipelines.ts` is the canonical config and the seed source for the
`pipelines` and `stages` tables; at runtime stage order is an integer column, so stages can be reordered or
added without a deploy. One `BoardScreen` component renders all four pipelines. That claim is what the
Switcher screen exists to demonstrate, and a Playwright test asserts no pipeline's stages ever leak into
another's board.

**Client state is only view state.** Zustand (`lib/store/ui.ts`) holds toasts and the demo rep switcher.
Board view, pipeline, track filter and list/board mode live in the URL via nuqs. Collapse state and list
sort are per-user preferences and live in the database.

**The WOW OS Funnel sits behind one adapter.** `lib/wow-os/client.ts` defines a `WowOsClient` interface and
ships an in-memory implementation. Swapping in the real Funnel API is a one-file change: implement the
interface, return it from `getWowOsClient()`. That file's header documents exactly what must change and
which environment variables a real integration needs. Nothing outside `lib/wow-os/` talks to the Funnel.

### Job completions — the one integration WOW OS still owes us

Post-job campaigns (a Google-review ask four days after the work finishes) need to know **when a job
finished**, as a timestamp. The job facts already on a card are display strings — `LAST JOB $8,400`,
`COMPLETED Aug 2025` — which render fine and cannot schedule anything.

**The endpoint for this is built. Nothing calls it yet.** Every row in the `jobs` table today was written by
`pnpm seed`. A populated table is not evidence the integration is live. Because of that, the job-based
audiences report themselves as unavailable in the Campaigns editor rather than silently selecting nobody —
see `audienceIsSupported()`.

There are two paths in, and WOW OS should build the first:

1. **Webhook (preferred).** `POST /api/wow-os/job-completed`, authenticated with
   `Authorization: Bearer $WOW_OS_WEBHOOK_SECRET`. A review request four days after completion is only as
   punctual as the news of the completion. The full contract — payload, field semantics, response codes,
   retry rules — is the header comment of **`lib/wow-os/jobs.ts`**. That file is the thing to hand to
   whoever builds the Funnel side.
2. **Pull (backstop).** `WowOsClient.listCompletedJobs(since)`, run from the daily cron. A webhook that is
   never delivered is lost silently, and the symptom is a campaign that just never fires for one customer.
   The pull reconciles within a day. Both paths converge on the same row.

Redelivery is safe: the endpoint is idempotent on the Funnel's own `jobId`, held in `jobs.wow_os_job_id`
under a unique index, so a retried webhook updates the row it already wrote and returns `created:false`. It
cannot produce a second row, and therefore cannot produce a second review request. Retry on any 5xx or
timeout; do not retry a 400.

Seeded completions carry a `seed:` prefix on that column and Funnel-delivered ones do not, which is what
lets `getJobCompletionStats()` answer "how many of these are real" — a screen can then say *5 completions,
none live yet* rather than implying an integration that does not exist. The prefix is reserved: a webhook
sending a `jobId` starting `seed:` is rejected.

To exercise ingest locally:

```bash
WOW_OS_WEBHOOK_SECRET=dev-ingest pnpm dev
curl -X POST localhost:3000/api/wow-os/job-completed \
  -H "Authorization: Bearer dev-ingest" -H "Content-Type: application/json" \
  -d '{"jobId":"WO-99001","accountId":"acct-r3","completedAt":"2026-07-28T16:40:00Z",
       "workType":"interior","scope":"4 rooms","areas":["hallway"],"valueCents":840000}'
```

First call returns `{"ok":true,"jobId":"WO-99001","id":"job-29a91384","created":true}`; every repeat returns
the same `id` with `created:false`.

### Layout

```
app/(app)/          the seven screens, inside the shared rail + top bar layout
app/actions/        server actions — every write in the product
app/api/            cron, health, and read-only JSON endpoints
components/         board, card, list, booking, field, record, manager, shell
db/                 Drizzle schema and migrations
lib/repositories/   the only code that reads or writes the database
lib/triggers/       the four trigger predicates, drafters, and the daily runner
lib/wow-os/         the Funnel adapter, booking helpers, job-completion ingest
lib/pipelines.ts    pipeline and stage configuration
tests/              unit (Vitest) and e2e (Playwright)
```

## Screens

| Route | Screen |
|---|---|
| `/board` | **Board** — pipeline selector, KPI strip, drag-and-drop columns, per-stage collapse. Commercial columns show a `$XXXK in stage` roll-up. |
| `/board?view=list` | **List** — the same deals as one sortable table; every header is a sort toggle. |
| `/approvals` | **Approvals** — each AI draft beside a numbered "why this fired" panel. Approve, edit, or skip. |
| `/field` | **Field** — phone-framed rep view: three one-tap outcomes, plus voice capture that parses speech into structured fields. No forms. |
| `/record/[id]` | **Record** — account detail, contacts, property details, the amber access-notes block, and the full provenance timeline. |
| `/manager` | **Manager** — neglected deals, rep leaderboard, pipeline health, and source → revenue attribution. |
| `/switcher` | **Switcher** — Commercial, Biz Dev and Partner rendered by the same board component, proving it is pipeline-generic. |

## Testing

```bash
pnpm test        # unit
pnpm test:e2e    # end to end
```

Unit tests cover the pure logic: stage rules, list sorting, the neglect and roll-up calculations, the voice
parser, trigger date arithmetic, the booking helpers, and the WOW OS adapter round trip. They need no
database.

The Playwright suite drives the signature flow above through a real browser against a production build, and
separately asserts that state survives a reload — a booked deal still reads "Linked in WOW OS · EST-#####"
after a refresh.

## Deployment

Deploys to Vercel from the repository root; the project is already linked via `.vercel/`.

Set `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `CRON_SECRET` and `WOW_OS_WEBHOOK_SECRET` on the Vercel project
for Production, Preview and Development. `ANTHROPIC_API_KEY` is optional, as above. Run `pnpm db:migrate` and
`pnpm seed` against the production database once, locally, with the production connection string.

> **Known gap: `CRON_SECRET` is set on Production but not on Preview** — the Vercel CLI rejects its own
> suggested command for adding it, so it has to go in through the dashboard (Project → Settings →
> Environment Variables → tick Preview). Until then Preview deploys 401 the cron route. That is the safe
> direction to fail, but it means a Preview URL cannot smoke-test a trigger run. `WOW_OS_WEBHOOK_SECRET`
> will behave the same way, for the same reason — set both in the same visit.

`vercel.json` pins functions to `iad1` — the same region as the Neon database, which keeps every query on a
short hop — and registers the daily cron:

```json
{ "path": "/api/cron/triggers", "schedule": "0 6 * * *" }
```

Vercel calls that route each morning with `Authorization: Bearer $CRON_SECRET`. The route refuses to run
without a matching secret, including when `CRON_SECRET` is simply unset — a misconfigured deploy fails
closed rather than leaving a write endpoint open. That applies in development too, so to run the sweep
locally you have to set the secret and send it:

```bash
CRON_SECRET=dev-secret pnpm dev
curl -H "Authorization: Bearer dev-secret" localhost:3000/api/cron/triggers
```

The sweep is idempotent: it skips any deal that already has a pending draft or one created that day, so a
retry costs nothing. Add `?dryRun=1` to evaluate and report without writing anything — it explains per
candidate why each deal did or did not fire, which makes it a good smoke test after a deploy. The response
includes `"drafter": "template" | "claude"` so you can see which path ran.
