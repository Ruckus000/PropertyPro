# Snowbird Digest — Absentee-Owner Transparency Feed — Design

**Date:** 2026-07-17 · **Effort:** ~2 weeks · **Depends on:** [Wave 1 overview](./2026-07-17-wave1-overview-design.md)
**Migration:** `0028_snowbird_digest_subscriptions`

## Context

An auto-generated weekly/monthly email recap for seasonal and out-of-state
owners: what the board decided, new documents, upcoming meetings/votes/
deadlines — compiled entirely from activity already in the platform. Zero
board effort (auto-generation is why this succeeds where newsletters die), and
it meets owners in the inbox: no login, no app.

Verification caveats that shaped this design:

- **"Courtesy summary, not official notice."** §718.112 electronic notice
  requires prior written consent and some notices may never be emailed. The
  digest carries an attorney-reviewed footer and is never positioned as
  satisfying notice requirements.
- **Clicks, not opens**, for any engagement signal (Apple MPP inflates opens
  15–35%). v1 ships no stats; v1.1 may add click-through counts.
- Resend volume at scale reaches the $20–90/mo tiers — small, flagged, no new
  vendor.

## Key architecture decision: compile-at-send, not the event queue

The existing `notification_digest_queue` pipeline is event-granular and
**discards rows whose `frequency` doesn't match the user's global
`email_frequency` preference** (`notification-digest-processor.ts`
`prefs.emailFrequency !== row.frequency` check). A snowbird wants a weekly
recap *regardless* of their global setting (which may be `immediate` or
`never` for event mail), and needs a `monthly` cadence the queue enum lacks.

So the digest is **compiled at send time**: an hourly cron queries the
activity tables directly for the trailing window and sends one email per
subscriber. No queue rows, no `mapEventTypeToKind` wiring, no idempotency
tuples — the watermark is a `last_sent_at` per subscription. This is less
machinery than riding the queue and cannot double-send or collide with the
existing digest.

## Data model

`packages/db/src/schema/snowbird-digest-subscriptions.ts`:

```
snowbird_digest_subscriptions
  id            bigserial PK
  community_id  bigint → communities (cascade)
  user_id       uuid → users (cascade)
  cadence       text NOT NULL DEFAULT 'weekly'   -- 'weekly' | 'monthly' | 'off'
  last_sent_at  timestamptz
  created_at / updated_at / deleted_at
  UNIQUE (community_id, user_id) WHERE deleted_at IS NULL   -- partial, per move-checklists pattern
```

**Default-on without backfill:** absence of a row = subscribed at `weekly` for
every member whose role resolves to unit owner (`resident.isUnitOwner`; legacy
`owner`), once the **board enables the feature for the community** (a
`snowbird_digest_enabled` boolean on `communities` — added in the same 0028
migration, default `false`). Opt-out writes a row with `cadence='off'`. This
implements the audit's "default-on with one-click unsubscribe" without a
million seeded rows, and the per-community board toggle keeps consent posture
conservative (attorney gate confirms; see overview).

**Migration `0028`**: table + partial unique index + RLS
(`tenant_admin_write`-style with a user-scoped twist: SELECT/INSERT/UPDATE
allowed for the owning user via existing member predicates — subscriptions are
self-service; clone the closest self-service family used by
`notification_preferences` policies), write-scope trigger, `RLS_TENANT_TABLES`
entry, `communities.snowbird_digest_enabled` column, journal idx 28.

## Compiler

`apps/web/src/lib/services/snowbird-digest-service.ts`:

`compileSnowbirdDigest(communityId, windowStart, windowEnd)` returns typed
sections, each item `{ title, detail?, date?, actionUrl }` (deep links to the
portal — magic-link sign-in is out of scope; links land on the normal
login-gated pages):

1. **Board decisions** — `meetings.minutes_approved_at` in window (link to
   minutes doc), `elections.certified_at` in window (result summary), closed
   `polls` (`ends_at` in window).
2. **New documents** — `documents.created_at` in window, grouped by category
   name (join `document_categories`), excluding soft-deleted; cap 10 with
   "and N more" (no silent truncation).
3. **Upcoming** — next 30 days: `meetings.starts_at` (with notice type),
   `elections.closes_at`, `polls.ends_at` (open ones).
4. **Compliance note** — one line from the existing compliance summary
   (`buildComplianceSummary`) when the community has `hasCompliance`:
   "Currently compliant" / "N items need attention" — factual wording only.

All queries via `createScopedClient(communityId)` with explicit filters
(pattern: `transparency-service.ts`). Empty digest rule: **if every section is
empty, skip the send** and do not advance `last_sent_at` beyond the window —
never send "nothing happened" mail (respect the inbox; it protects open
rates and the feature's welcome).

## Send cron

New route `apps/web/src/app/api/v1/internal/snowbird-digest/route.ts`
(`POST`, `requireCronSecret(req, process.env.SNOWBIRD_DIGEST_CRON_SECRET)`),
registered in `apps/web/vercel.json` at `0 * * * *` (hourly). Per run:

1. Cross-tenant scan (model: `findCandidateDigestCommunityIds` in
   `packages/db/src/queries/notification-digest.ts`; new sibling query in the
   same file, exported via `@propertypro/db/unsafe`) for communities with
   `snowbird_digest_enabled = true`.
2. **8 AM community-local gate** — copy the timezone/local-hour logic from
   `notification-digest-processor.ts`. Weekly sends fire Monday; monthly on
   the 1st.
3. Resolve recipients: owner-role members, minus `cadence='off'` rows, minus
   users with no email; apply per-user cadence.
4. `last_sent_at` watermark: window = `[last_sent_at ?? now - cadence, now]`;
   update after successful send (per-recipient row is created lazily on first
   send so the watermark is per-user). Concurrency via `runWithConcurrency`
   (8) and the 500-emails-per-tick budget pattern, both copied from the
   processor.
5. Send `SnowbirdDigestEmail` via `sendEmail` with
   `category: 'non-transactional'` — **`unsubscribeUrl` is mandatory** (the
   send layer throws without it): reuse the exact unsubscribe-URL mechanism the
   notification-digest processor passes today (same generator, new
   `source=snowbird` param); one click sets `cadence='off'` without login
   (signed token, no session).

## Email template

`packages/email/src/templates/snowbird-digest-email.tsx` (+ barrel export).
`EmailLayout` shell with `CommunityBranding`; extend the cron's branding load
to include `logoUrl`/`accentColor` from `communities` (the template supports
them; the current processor only passes `communityName` — small win, shared
with future digests). Sections in the order above; every item links; footer =
attorney-reviewed courtesy-summary disclaimer + unsubscribe + cadence-switch
link. Subject: `"{Community name} — your {week|month} in review"`.

## Self-service preferences

Contract routes `apps/web/src/app/api/v1/snowbird-digest/contract.ts` +
`route.ts` (tenantScope; `runRoute` from `@/lib/api/run-route`):

- `GET /api/v1/snowbird-digest/subscription` — `{ in: 'query' }`, permission
  `settings:read` — effective cadence for the current user (row or implicit
  default given community toggle + role).
- `PATCH /api/v1/snowbird-digest/subscription` — `{ in: 'body' }`,
  `settings:read` (self-service; write is to the caller's own row — enforce
  `userId = auth user`, never accept a target user id).
- `PATCH /api/v1/snowbird-digest/community` — `{ in: 'body' }`,
  `settings:write` — board toggle for `snowbird_digest_enabled`.

UI: a "Snowbird digest" card in the existing notification-preferences settings
surface (`apps/web/src/components/settings/notification-preferences.tsx`
neighborhood + `use-notification-preferences.ts` sibling hook
`use-snowbird-digest.ts`): cadence radio (Weekly / Monthly / Off) for members;
an enable toggle + short explainer for admins. No new page, no nav entry —
the feature lives in email and in settings, by design.

## Docs

- One article in the existing `getting-started` category:
  `content/help/getting-started/snowbird-digest.mdx` — resident-first (what it
  is, changing cadence, unsubscribing) with a short board section at the end
  (enabling it for the community). `featureGates: [hasSnowbirdDigest]`.
- The enable-toggle explainer and the email footer are the primary docs;
  the article is fallback.

## Tests & verification

- Compiler unit tests: window math around `last_sent_at`, empty-digest skip,
  per-section caps, soft-delete exclusion.
- Cron tests: local-hour gate (mock timezones), Monday/1st cadence selection,
  watermark advance only on success, `cadence='off'` respected, budget
  release-back.
- Route tests: self-service PATCH cannot touch another user; board toggle
  requires `settings:write`; feature-flag 403.
- Manual: enable on Palm Shores via `/dev/agent-login?as=founding_admin`,
  force-run the cron route with the secret against dev, inspect the test
  inbox (`RESEND_API_KEY` unset → `testInbox`).
- Integration caution: integration tests run PR-only — run explicitly since
  this adds cross-tenant queries.

## Out of scope (v1.1+)

Board-facing click stats (Resend `email.clicked` webhooks); event photos;
project/work-order status section; magic-link deep links; per-section
preferences; monthly-vs-weekly A/B.
