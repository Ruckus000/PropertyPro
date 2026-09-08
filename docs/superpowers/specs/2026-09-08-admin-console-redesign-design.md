# Admin Console Redesign — design

**Date:** 2026-09-08 · **Status:** approved for planning · **Owner:** platform
**Source design:** claude.ai/design project `ed8d770b-d861-4ba1-946f-293aef503fef`,
file `Admin Console Redesign.dc.html` (13 screens + shell). The companion
`Current Admin Console.dc.html` is a reconstruction of today's console and the
project's `github.md` records the screen→file map this spec reuses.

This spec was written after reading the design file end to end, the design-system
bundle it imports, and every `apps/admin` surface it touches. It applies the
[ponytail](https://github.com/dietrichgebert/ponytail) decision ladder to each
screen: does it need to exist → is it already in the codebase → stdlib →
platform → installed dependency → one line → minimum implementation. Where the
ladder stopped at "already in the codebase", the spec says which file.

## 1. Goal

Ship the redesigned operator console in `apps/admin`: the hover-expanding rail
shell, the Florida Modern visual language (sand surfaces, coral primary,
Fraunces page titles, 18px root), the restyled existing screens, and the five
new operator subsystems the design introduces — Tickets, Health, Billing,
Onboarding, and the notification/search/PWA layer — each backed by real data.

Non-goals, decided with the user on 2026-09-08:

- **Dark theme and text-size scaling** are deferred. The token layer is
  single-theme light by the 2026-07-13 design-system spec ("must not pretend to
  theme"), admin's Tailwind config sets `darkMode: 'class'` specifically to
  neutralise dark rules, and the design's dark palette is inline hex overrides
  in the prototype rather than tokens. The Settings "Display" section is omitted.
- **In-console refunds.** Refunds stay a deep link to the Stripe dashboard.
- **Queued offline mutations.** Offline is read-only.
- **Admin-initiated community deletion** from the workspace Danger zone. The
  deletion flow (14-day cooling, board notification) is owned by the web app;
  the Danger zone shows an existing request's status and links to Deletion
  requests.
- **Sentry write actions** ("Ignore" an issue). The token is read-scoped;
  "Ignore" is a deep link.

## 2. Decision ledger (normative)

An implementer who disagrees with a ledger entry files a finding; it does not
stop and ask.

| # | Decision | Rationale |
|---|---|---|
| D1 | **Incremental in-place migration**, not a v2 route group or rewrite. New shell first; each existing page keeps its data layer and is restyled inside it; new subsystems land as separate slices. | The console has no external users, so nothing needs a flag or dual-running shell. 13k lines of data code stay. |
| D2 | Authenticated pages move into an `app/(console)/` route group whose `layout.tsx` renders the shell once. `AdminLayout.tsx` and `Sidebar.tsx` are deleted. `error.tsx`/`not-found.tsx` stay outside with their own `<main id="main-content">`. | Removes 25 repeated page wrappers and gives shell signals one place to load. Next-native (ladder rung 4). |
| D3 | Shared components the design uses are **lifted into `packages/ui`** and the web app re-exports them from its existing paths. Lift list: shadcn `Button`, `Badge` (exported as `ShadcnBadge`), `Card`, `Skeleton`, `Sheet`, `Dialog`, `AlertDialog`, `Switch`, `Input`, `Textarea`, `Label`, `Command`; shared `KpiCard`, `QuickFilterTabs`, `AlertBanner`, `EmptyState`, `PageBody`. The deprecated `packages/ui` `Button`/`Card` are replaced by the shadcn versions (that is what the deprecation was for). | One source for both apps. Web keeps hundreds of imports intact via re-export files. |
| D4 | `packages/ui` gains deps: `@radix-ui/react-dialog`, `react-alert-dialog`, `react-slot`, `react-switch`, `react-label`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `cmdk`; a `cn()` export; tsup externals updated. **No `next` dependency** — components take an `href` and an optional `linkComponent` prop (NavRail's `renderLink` pattern) and web passes `Link`. | packages/ui must stay framework-agnostic. |
| D5 | `EmptyState` in packages/ui is props-only. The `EMPTY_STATE_CONFIGS` preset lookup stays in web as a thin wrapper. | Presets are web domain content. |
| D6 | Admin root font-size becomes **18px** (matches `apps/web/src/app/globals.css`), not the design's 17px. Fraunces is vendored into `apps/admin/src/app/fonts/` exactly as Inter is, exposed as `--font-display`, and `font-display` is added to admin's Tailwind `fontFamily`. | One root size across the product; the design-system README also documents 18px. |
| D7 | Admin **paints** the Fraunces `h1` and description as designed, via a new `AdminPageHeader` in `apps/admin/src/components/shell/`. Web's `PageHeader` (sr-only title) is **not** reused. | The two apps made opposite title decisions; admin has no breadcrumb trail to name the page. `guard:page-header` scans web only. |
| D8 | Hover-expand is built on `packages/ui` `NavRail` (`expanded` is already a controlled prop) plus a pin toggle persisted in `localStorage` (`ppro-admin-nav-pinned`). Hover is disabled on `(hover: none)` devices. Mobile (<900px) uses a `Sheet` drawer. | Reuse over rewrite. |
| D9 | Nav structure is the design's three groups: Operate (Dashboard, Inbox, Tickets, Health), Customers (Clients, Onboarding, Billing, Leads, Demos), Platform (Deletion requests, Site templates, Settings). **Rootless Communities** leaves the nav: `/communities/rootless` redirects to `/clients?filter=rootless`, and its dispute queue becomes the Clients dispute banner with the existing `ReassignRootControl`. | Design decision, no functionality lost. |
| D10 | Client workspace has **8 tabs**: Overview, Billing (new), Members, Compliance, Access (kept), Website, Support, Settings. Apartments still hide Compliance. The `role="tab"` names "Support", the "Support Access" heading and the "Start Session" dialog labels are preserved verbatim — `support-access.spec.ts` is in the CI allowlist. | User decision: keep Access. |
| D11 | Shell signals (nav counts, tray items, critical alert) come from **one server module** `lib/server/shell-signals.ts` composed from per-domain provider files (`signals/inbox.ts`, `tickets.ts`, `health.ts`, `billing.ts`, `onboarding.ts`, `leads.ts`, `deletion.ts`). The layout loads them once per request; the client refreshes via `GET /api/admin/shell/signals` every 60s while visible. No notifications table. | Derived, not stored: every tray item already has a source of truth. Per-domain files keep later waves' edits disjoint. |
| D12 | "Mark all read" and alert preferences persist in a new platform-scoped table `platform_admin_preferences` (one row per admin: `notifications_read_at`, `alert_prefs jsonb`, `push_sent_fingerprints jsonb`). | Per-admin state that must follow the admin across devices. |
| D13 | **Tickets** are a new platform-scoped table pair `support_tickets` + `support_ticket_events` (migration `0072`), RLS-locked to `service_role` on the `0068_support_inbox` posture, with `rls-config.ts` entries. Display key is `T-{id}`. Activity is the events table, not the audit log. | Nothing exists today. Same lockdown as the inbox: no `community_id` on the table's identity, a nullable link to one. |
| D14 | **Inbox** keeps two routes. `/inbox` renders mailbox cards + status tabs + the thread list; selecting a thread navigates to `/inbox/[threadId]`, which renders the same split layout on desktop (list + thread) and the thread alone with a Back button on mobile. HTML stays sanitized server-side in the page. | The thread page is the only place raw `html_body` is sanitized; a client-fetched pane would need the API to sanitize, which it deliberately does not. |
| D15 | Canned replies are a static per-mailbox list in `packages/shared/src/support-inbox.ts` (`SUPPORT_MAILBOX_CANNED_REPLIES`). "Add as internal note" reuses the existing notes API. Context-strip actions: support → `/tickets/new?thread=<id>`; privacy → `/deletion-requests?q=<email>`; contact → `POST /api/admin/leads` (new create route) then `/leads`. | Ladder rung 2 for two of three; one small new route. |
| D16 | **Billing** reads live from Stripe with admin's existing `getStripeClient()`. The global page lists `stripe.subscriptions.list` (paged, all statuses) joined to `communities.stripe_subscription_id`, cached in-process for 5 minutes; the 12-month MRR series comes from `revenue_snapshots`. The workspace tab retrieves the one subscription plus `invoices.list` (limit 12). | Real numbers with a bounded call count; snapshots already exist for history. |
| D17 | Billing writes are `POST /api/admin/communities/[id]/billing/{change-plan,extend-trial,apply-coupon,pause,cancel}`. Each: `requirePlatformAdmin`, Zod body, `stripeKeyLivemode` mode check, Stripe call with an idempotency key, `logAdminAction` with a new `AdminAuditAction`. The local `communities` row is **not** written by admin; the web Stripe webhook remains the single writer and the UI shows the Stripe response optimistically. Every action sits behind an `AlertDialog` confirm. **Refunds are a deep link.** | Single-writer invariant for subscription columns; user decision on refunds. |
| D18 | **Health**: services strip probes `apps/web` `/api/health`, admin `/api/health`, Supabase (`select 1` latency), Stripe (`balance.retrieve` latency), Resend (`GET /domains`); errors come from the Sentry Issues API with a new read-scoped `SENTRY_API_TOKEN`; failed jobs come from `cron_runs` (`last_status = 'failed'` or `consecutive_failures > 0`) and `stripe_webhook_events` (`processed_at IS NULL`, last 24h). | User approved the Sentry token. Everything else is in-repo or stdlib. |
| D19 | Health "Retry" is available for **cron jobs only**: `POST /api/admin/health/jobs/[slug]/retry` calls the job URL on the web app with `CRON_SECRET`, which is added to the admin Vercel project. Unprocessed Stripe webhook rows show "Stripe retries automatically" with a dashboard link (the table stores no payload to replay). "Retry all" retries failed cron jobs. | Replaying a webhook needs the raw event; we do not keep it. |
| D20 | The **critical banner** fires when any of: Sentry issues in the last hour ≥ the admin's "error spike" threshold (default 10), unprocessed Stripe webhooks in the last hour ≥ 1, any cron `consecutive_failures ≥ 2`. Dismissal is per device, keyed by the alert fingerprint (`sessionStorage`). | Same signals as the tray; no new state. |
| D21 | **Onboarding** is derived, no schema change: Lead = `marketing_leads` in new/contacted/qualified; Demo = `demo_instances` not converted; Trial = communities with `subscription_status = 'trialing'` with progress from `onboarding_checklist_items`; Active·30d = active subscriptions converted within 30 days. Blockers: stale demo (existing `stale-badge` thresholds), trial with no root manager, trial ending ≤ 7 days. "Next" is a static rule map keyed on the first incomplete item. | Ladder rung 2 throughout. |
| D22 | **Search** is one endpoint `GET /api/admin/search?q=` returning up to 5 hits per group over communities (name/slug), threads (subject/participant), tickets (title), users (`users.full_name`/`email`), plus the static page list. Palette built on the lifted `Command` primitives, debounced 150ms. | Small, no index. |
| D23 | **Web push**: `web-push` dependency in admin; `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` env on the admin Vercel project; table `platform_admin_push_subscriptions` (migration `0073`, with `platform_admin_preferences`); a hand-written `public/sw.js` `push` handler; dispatch by an admin-project Vercel cron `POST /api/admin/internal/push-dispatch` every 15 minutes, guarded by `CRON_SECRET`, deduped per admin by signal fingerprint stored in preferences. | User chose full push. Dispatch must be a cron because nothing else runs on a schedule in admin. |
| D24 | **PWA**: `app/manifest.ts`, committed 192/512 PNG icons generated once from `icon.svg` with `sharp` (already a root devDependency), `public/sw.js` registered in production only: cache-first for `/_next/static`, network-first with cache fallback for GET navigations, never caches `/api/` or non-GET. The offline banner shows the cached page's age from the SW `Date` header. Mutations offline get a blocking toast, nothing is queued. CSP already emits `worker-src 'self'`; add `manifest-src 'self'`. | User decision: read-only offline. |
| D25 | Dashboard KPIs show a delta **only where history exists**: MRR and past due (revenue snapshots), communities (`created_at`), members (`user_roles.created_at`). Compliance, trials and open threads show value only. The design's "Uptime" KPI is replaced by "Failed jobs" — nothing stores probe history. KPI detail modals show the 12-month series where one exists and the breakdown table otherwise. | No fabricated series. |
| D26 | Website tab DNS checks use `node:dns/promises` (`resolve4`, `resolveCname`) plus a HEAD probe for the redirect and an `https` fetch for TLS, in `GET /api/admin/communities/[id]/website/dns`. Snapshots list `site_publish_snapshots` and restore through the existing `restore-from-snapshot` route. | Ladder rung 3 (stdlib). |
| D27 | Members tab role changes go through the existing `PATCH .../members/[userId]`; the root manager row is locked as today. Member filters are client-side over the existing members payload. | Exists. |
| D28 | Stale-demo management moves from `ClientPortfolio` to the Demos page (age badge, delete). | Matches the design; one home per concern. |
| D29 | Every new file is clean under `guard:design-tokens`; `Sidebar.tsx`'s 15 baselined raw-palette hits disappear with the file (baseline shrinks). `scripts/verify-admin-semantic-css.cjs` extends its scan root to `packages/ui/src`, since admin's Tailwind `content` already globs it. | Guard contract. |
| D30 | Status is never colour alone: sparklines and progress bars carry the number and label; badges come from `packages/ui` `Badge` (icon + text). Focus rings are never suppressed. All new tab strips use `useRovingTabs`. | Ponytail non-negotiables + design.md. |

## 3. Architecture

```
apps/admin/src/app/
  (console)/layout.tsx          ← requireAdminPageSession + getShellSignals → <AdminShell>
  (console)/{dashboard,inbox,tickets,health,clients,onboarding,billing,leads,demo,
             deletion-requests,site-templates,settings}/…
  communities/rootless/page.tsx ← redirect('/clients?filter=rootless')
  manifest.ts · public/sw.js · api/admin/{shell,search,tickets,health,billing,…}

apps/admin/src/components/shell/
  AdminShell.tsx (client: rail/drawer state, ⌘K, tray, banners, <main id="main-content">)
  AdminRail.tsx · AdminDrawer.tsx · AdminTopBar.tsx · AdminPageHeader.tsx
  CriticalBanner.tsx · OfflineBanner.tsx · NotificationTray.tsx · AdminCommandPalette.tsx
  nav-config.ts (groups, hrefs, icons, signal keys)

apps/admin/src/lib/server/
  shell-signals.ts + signals/{inbox,tickets,health,billing,onboarding,leads,deletion}.ts
  tickets.ts · health.ts · sentry.ts · billing.ts · onboarding.ts · search.ts
  preferences.ts · push.ts

packages/ui/src/components/  ← lifted shadcn + shared components (D3), cn()
packages/db/migrations/0072_support_tickets.sql · 0073_platform_admin_preferences.sql
```

Data flow for the shell: layout (RSC) → `getShellSignals()` → props to
`AdminShell` → client refresh via `/api/admin/shell/signals`. The same signals
feed the nav badges, the tray, the critical banner, the dashboard "Needs
attention" queue, and push dispatch.

## 4. Screens

| Screen | Route | Source of truth | Change |
|---|---|---|---|
| Dashboard | `/dashboard` | `lib/server/dashboard.ts` (+ signals, revenue snapshots) | Restyle: 8 KPI cards with detail modal, Needs-attention queue, Revenue card, Subscriptions bar. |
| Inbox | `/inbox`, `/inbox/[id]` | `lib/server/inbox.ts` | Mailbox cards, status tabs, split pane, context strip, canned replies (D14, D15). |
| Tickets | `/tickets`, `/tickets/[id]`, `/tickets/new` | new (D13) | New. |
| Health | `/health` | new (D18–D20) | New. |
| Clients | `/clients` | `clients/page.tsx` + `ClientPortfolio` + disputes | Card grid, five quick filters, dispute banner (D9). |
| Client workspace | `/clients/[id]` | existing tabs + Billing tab | 8 tabs (D10), DNS checks (D26). |
| Onboarding | `/onboarding` | derived (D21) | New. |
| Billing | `/billing` | Stripe + snapshots (D16) | New. |
| Leads | `/leads` | `lib/server/leads.ts` | Restyle; "Create demo" prefilled link. |
| Demos | `/demo` | `lib/server/demos.ts` | Restyle; absorbs stale-demo actions (D28). Wizard/preview screens unchanged. |
| Deletion requests | `/deletion-requests` | `lib/server/deletion-requests.ts` | Restyle with cooling banner. |
| Site templates | `/site-templates` (+ sub-pages) | existing | Restyle the hub; sub-pages get the shell and header only. |
| Settings | `/settings` | `platform_admin_users` + preferences + health | Admins list, Alerts & push, Install app, Integrations. No Display section. |

## 5. Data model

**`0072_support_tickets`** (EXPAND)

- `support_tickets`: `id bigserial pk`, `title text not null`, `description text`,
  `priority text check in (low, medium, high)`, `category text check in (billing,
  compliance, site, access, other)`, `status text check in (open, waiting,
  resolved)`, `community_id bigint null → communities on delete set null`,
  `thread_id bigint null → support_inbox_threads on delete set null`,
  `external_ref text null` (Sentry issue id), `assignee_user_id uuid null`,
  `created_by uuid not null`, `resolved_at timestamptz`, `created_at`,
  `updated_at`. Indexes on `(status, priority, updated_at desc)`, `thread_id`,
  `community_id`.
- `support_ticket_events`: `id`, `ticket_id → support_tickets cascade`, `kind
  text check in (created, note, status_changed, priority_changed, assigned,
  linked)`, `body text`, `actor_user_id uuid not null`, `created_at`. Index
  `(ticket_id, id)`.
- RLS enabled + forced, zero policies, REVOKE from anon/authenticated on tables
  and sequences, GRANT to service_role — verbatim `0068` posture. Two
  `rls-config.ts` entries with reasons.

**`0073_platform_admin_preferences`** (EXPAND)

- `platform_admin_preferences`: `user_id uuid pk`, `notifications_read_at
  timestamptz`, `alert_prefs jsonb not null default '{}'`,
  `push_sent_fingerprints jsonb not null default '[]'`, `updated_at`.
- `platform_admin_push_subscriptions`: `id`, `user_id uuid not null`, `endpoint
  text unique`, `p256dh text`, `auth text`, `user_agent text`, `created_at`,
  `last_success_at`, `failure_count int default 0`.
- Same lockdown. Both tables are platform-scoped by construction and must be
  added to `RLS_GLOBAL_TABLE_EXCLUSIONS`-style config exactly as the inbox
  tables were.

Both migrations are scaffolded with `pnpm db:migration:new`, take `0072`/`0073`
(prod ledger verified 2026-09-08: tip `0071`, nothing in flight above it on any
remote branch), are applied to prod manually **before** the code that reads them
deploys, get hand-inserted ledger rows, and are checked with
`pnpm db:ledger:verify`.

## 6. API surface (all `withAdminErrorHandler` + `requirePlatformAdmin`)

```
GET  /api/admin/shell/signals
GET  /api/admin/search?q=
GET  /api/admin/tickets?status=&priority=            POST /api/admin/tickets
GET  /api/admin/tickets/[id]                         PATCH /api/admin/tickets/[id]
POST /api/admin/tickets/[id]/events
GET  /api/admin/health                                POST /api/admin/health/jobs/[slug]/retry
GET  /api/admin/billing/subscriptions?status=
GET  /api/admin/communities/[id]/billing
POST /api/admin/communities/[id]/billing/{change-plan,extend-trial,apply-coupon,pause,cancel}
GET  /api/admin/communities/[id]/website/dns
GET  /api/admin/onboarding
POST /api/admin/leads                                  (create from a thread)
GET/PUT /api/admin/preferences                         POST /api/admin/preferences/read-all
POST/DELETE /api/admin/push/subscriptions
POST /api/admin/internal/push-dispatch                (CRON_SECRET)
```

New `AdminAuditAction` values: `ticket_created`, `ticket_updated`,
`subscription_plan_changed`, `subscription_trial_extended`,
`subscription_coupon_applied`, `subscription_paused`, `subscription_canceled`,
`cron_job_retried`, `lead_created_from_thread`, `push_subscription_added`,
`push_subscription_removed`.

## 7. States, errors, accessibility

- Every list handles loading (`Skeleton`), empty (`EmptyState` with a
  constructive action), error (`AlertBanner status="danger"`), success.
- Server pages throw on query errors (the console's established "never render a
  plausible zero" rule); routes return the admin error envelope.
- Third-party probes (Sentry, Stripe, Resend) degrade per section: a failed probe
  renders that section's error state and never blanks the page.
- Rail: `aria-current="page"`, icon-only links carry `aria-label`, pin button
  carries `aria-expanded`; drawer traps focus (Radix `Sheet`); palette is a
  `dialog`; tray is a `menu`-less popover with `aria-expanded` on the trigger.
- Sign-out keeps the exact failure semantics pinned by
  `sidebar-signout.test.tsx` (the test moves with the component).

## 8. Testing

- Unit (node + jsdom in admin's vitest): signals composition, health derivations
  (thresholds, banner fingerprint), billing mapping (Stripe → rows, MRR from
  prices/intervals), onboarding derivation, search ranking, DNS check mapping,
  ticket routes (401/403/400/audit), billing routes (mode guard, idempotency key,
  confirm-only), preferences routes, push dispatch dedupe, SW cache policy (pure
  function), rail/drawer a11y, sign-out.
- Every fix-shaped test records its **revert check**: the production line
  removed and the failure message observed.
- Integration (local DB): RLS lockdown of the four new tables on the
  `platform-admin-demo-guard.integration.test.ts` pattern.
- E2E: `support-access.spec.ts` unchanged and green; new `admin-shell.spec.ts`
  (rail navigation, ⌘K, tray) added to `ci-safe-specs.json` with the count bumped.
- Build-time: `pnpm --filter @propertypro/admin build` then
  `node scripts/verify-admin-semantic-css.cjs`; `pnpm lint`, `pnpm typecheck`,
  `pnpm guard:design-tokens` (baseline shrinks by `Sidebar.tsx`).
- Review gate: security review + code review before each wave's PR.

## 9. External dependencies to provision (before the dependent wave)

| Secret / setting | Project | Used by |
|---|---|---|
| `SENTRY_API_TOKEN` (org read: `project:read`, `event:read`) | admin | Health, Settings integrations |
| `CRON_SECRET` (same value as web) | admin | Health retry, push dispatch cron |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | admin | Web push |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | admin | Browser subscription |
| Vercel cron on the admin project (`*/15 * * * *` → `/api/admin/internal/push-dispatch`) | admin | Push |

`STRIPE_SECRET_KEY` and `RESEND_API_KEY` already exist on the admin project.
Prod migrations `0072`/`0073` are applied manually per the migration-safety rule.

## 10. Risks

- **Lift blast radius.** Replacing `packages/ui` `Button`/`Card` and adding
  re-exports in web touches many import sites. Mitigated by keeping web paths
  stable and running `guard:class-resolution` + web typecheck in the same PR.
- **Stripe call volume** on the Billing page. Bounded by the 5-minute cache and
  46 communities today; the plan adds a `truncated` flag at 500.
- **Push without a scheduler** would silently never send. The Vercel cron is a
  hard prerequisite, verified by the `/api/admin/internal/push-dispatch` heartbeat
  test in the plan.
- **Design-sync drift.** The design project's `github.md` screen map names the
  files this spec moves. The plan's last task updates it.
