# Wave 1 — "No-Willpower" Differentiation Features: Overview & Shared Infrastructure

**Date:** 2026-07-17
**Source:** Competitive-differentiation research + human-nature audit (report artifact `1ac4110f`; memory `project-differentiation-research-2026-07`).
**Features:** three specs, built in this order:

1. [Wind-Mitigation Locker](./2026-07-17-wave1-wind-mitigation-locker-design.md) (~1.5 wk)
2. [Snowbird Digest](./2026-07-17-wave1-snowbird-digest-design.md) (~2 wk)
3. [Insurance Summary + Certificate Request Relay](./2026-07-17-wave1-insurance-summary-design.md) (~2 wk)

## Why these three first

All three passed adversarial verification (no competitor ships them), earned **A-grades in the human-nature audit** (each works with a single board action or none, has an external trigger — insurance renewal, unit closing, the inbox — and pays someone real money or real time), and require **zero new vendors**: Supabase + Resend + existing cron patterns only.

Design doctrine that governs every decision in these specs:

- **Zero-setup default** — each feature renders something useful before configuration.
- **Auto-derive, never dual-enter** — no volunteer updates two systems.
- **External triggers over willpower** — renewals, closings, and inbox delivery do the motivating.
- **One-tap for boards** — recurring board actions are single taps.
- **Factual display only** — no savings promises, no adequacy assessments, no advice.

## Shared infrastructure (build once, in the wind-mit PR)

### RBAC resource: `insurance`

Add `'insurance'` to `RBAC_RESOURCES` and a `PHASE5_POLICIES` entry in
`packages/shared/src/rbac-matrix.ts`: **read = all community roles** (owners must
see and download), **write = admin tier** (same cells as `contracts`),
`excludedCommunityTypes: []` (apartments excluded at the feature-flag layer
instead, so the matrix stays uniform). The RBAC parity snapshot
(`packages/shared/src/__tests__/rbac-parity.test.ts`) will force regeneration —
run `generate-rbac-snapshots.ts`.

Used by: wind-mit routes (spec 1) and insurance-summary routes (spec 3).
The snowbird digest reuses existing resources (it only reads).

### Feature flag: `hasInsuranceHub`

Add to `CommunityFeatures` (`packages/shared/src/features/types.ts`), set in
`COMMUNITY_FEATURES` (`community-features.ts`): `condo_718: true`,
`hoa_720: true`, `apartment: false`. Add to `PLAN_FEATURES`
(`plan-features.ts`) — available on all paid plans (this is a
differentiation/retention feature, not an upsell; revisit if pricing strategy
changes). Also add the key to `COMMUNITY_FEATURE_KEYS` (help-center
`featureGates` validation depends on it).

The snowbird digest gets its own flag `hasSnowbirdDigest` (all three community
types `true` — apartments benefit too).

### Navigation: one "Insurance" entry

One nav item in `apps/web/src/components/layout/nav-config.ts` hosting both
insurance features:

```ts
{ id: 'insurance', label: 'Insurance', icon: ShieldCheck,
  href: (cid) => `/communities/${cid}/insurance`,
  featureKey: 'hasInsuranceHub', navTier: 'more',
  matchPrefixes: ['/communities/[id]/insurance'] }
```

No `roles:` restriction — residents are the primary readers. Add `'insurance'`
to the `Community` group in `NAV_SECTIONS`. The page is
`/communities/[id]/insurance` (path-scoped tenancy; breadcrumb hrefs must NOT
append `?communityId=` per `.claude/rules/design.md`).

### Shared cron: `/api/v1/internal/insurance-alerts`

One internal cron route serves both wind-mit expiry alerts (spec 1) and
master-policy renewal alerts (spec 3). Modeled on
`apps/web/src/app/api/v1/internal/compliance-alerts/route.ts`:
`POST` + `withErrorHandler` + `requireCronSecret(req, process.env.INSURANCE_ALERTS_CRON_SECRET)`.
Register in `apps/web/vercel.json` `crons[]` at `0 8 * * *`. New env var
`INSURANCE_ALERTS_CRON_SECRET` (add to Vercel + `.env.local` docs — flagging
now per the external-deps working agreement: this is a new secret, not a new
service).

The snowbird digest has its own hourly cron (see spec 2).

### Migration number reservations

Per `.claude/rules/migration-safety.md` (manual prod applies; expand-before-code).
Next-free verified 2026-07-17 = **0027** (journal idx 27; 0026 is applied+ledgered).

| Migration | Contents | Spec |
|---|---|---|
| `0027_wind_mitigation_reports` | `wind_mitigation_reports` table + RLS + trigger | 1 |
| `0028_snowbird_digest_subscriptions` | `snowbird_digest_subscriptions` table + RLS + trigger | 2 |
| `0029_insurance_policies` | `insurance_policies` + `insurance_certificate_requests` tables + RLS + trigger | 3 |

Re-verify next-free at build time (another branch may land first — renumber
forward, never reuse). All are **expand** migrations: apply to prod via Supabase
MCP `apply_migration` *before* merging the code that reads them, then record in
the ledger (hash = sha256 of file bytes, created_at = journal `when`).

### Legal / attorney-review gate (blocking, one engagement)

One attorney review covers all Wave 1 copy before any feature is enabled in
prod (mirrors the existing e-voting review gate). The reviewed strings ship as
constants in `apps/web/src/lib/constants/insurance-disclaimers.ts` so they
cannot drift per-page:

1. Wind-mit: hedged savings language ("may reduce"; never amounts), form-family
   and validity phrasing.
2. Snowbird digest: "courtesy summary — not an official notice under §718.112"
   footer; confirmation that default-on delivery to owner emails already on
   file is acceptable as a courtesy communication (board enables per
   community; owner one-click opt-out).
3. Insurance summary: "summary only; the agent-issued documents control;
   confers no rights" + certificate-relay framing (PropertyPro relays a
   request to the agent of record; it does not issue certificates).

### Docs deliverables (every spec repeats this pattern)

- Empty-state entries in `apps/web/src/lib/constants/empty-states.ts`.
- Help category `insurance` in `apps/web/src/lib/help/category-meta.ts`
  (`ShieldCheck` icon), plus per-feature MDX articles under
  `apps/web/src/content/help/insurance/` — one **board** article (setup) and
  one **resident** article (use) per feature, `featureGates: [hasInsuranceHub]`
  (or `[hasSnowbirdDigest]`), task-titled, under 400 words, structure:
  two-sentence summary → three-step quickstart → short FAQ.
- Campaign emails double as tutorials (the renewal reminder *is* the wind-mit
  guide).

### Definition of done (each spec)

`pnpm typecheck` + `pnpm lint` (includes db-access, tenant-scope, breadcrumbs,
design-tokens guards) + `pnpm test` green; route unit tests following
`apps/web/__tests__/contracts/contracts-route.test.ts` mock pattern; contract
files auto-registered by the B4 suite (no manual step — but run it); manual
verification via `/dev/agent-login` flows listed per spec; migration applied +
ledgered on prod before merge.
