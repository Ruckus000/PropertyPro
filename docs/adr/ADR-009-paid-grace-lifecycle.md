# ADR-009: Paid Grace Lifecycle for Public GA

- Status: Accepted
- Date: July 11, 2026
- Deciders: Product Owner, Engineering
- Scope: Paid subscription cancellation grace, mutation soft lock, lifecycle boundaries
- Design source: [`docs/superpowers/specs/2026-07-10-public-ga-shippable-prd-design.md`](../superpowers/specs/2026-07-10-public-ga-shippable-prd-design.md) §8
- Implementation plan: [`docs/superpowers/plans/2026-07-11-wave-1b-access-lifecycle.md`](../superpowers/plans/2026-07-11-wave-1b-access-lifecycle.md)

## Context

Public GA has three independent lifecycle systems. Their overlapping names
("grace," "trial," and "free access") previously made it unclear which system
authorizes a community mutation after a paid subscription is canceled.

This ADR establishes the paid cancellation rule without merging the systems or
expanding the soft lock to every write route.

## Decision

### 1) Three lifecycle systems remain separate

| System | Source of truth | Applies to | Mutation effect |
|---|---|---|---|
| Paid subscription | `subscription_status` and `subscription_canceled_at` | Non-demo paid communities | `canceled` remains writable through derived paid grace; locks after grace. Other locked statuses lock immediately. |
| Platform access plan | `free_access_expires_at` | Communities granted platform access | A future expiry overrides a paid soft lock. This system is unchanged. |
| Demo grace | `trial_ends_at`, `demo_expires_at`, and `assertNotDemoGrace` | `is_demo = true` communities only | Independent `DEMO_GRACE_READ_ONLY` behavior. This system is unchanged. |

For a non-demo mutation, a future `free_access_expires_at` allows the request
before the paid-status lock is evaluated. Demo requests continue through
`assertNotDemoGrace` first and are not interpreted as paid grace.

### 2) Paid cancellation grace is derived

`PAID_GRACE_DAYS` is **7**. The guard derives:

```text
grace_until = subscription_canceled_at + 7 days
```

The window is exclusive at `grace_until`: a `canceled` community may mutate
while `now < grace_until`, and receives `403 SUBSCRIPTION_REQUIRED` afterwards.
`unpaid`, `expired`, and `incomplete_expired` remain immediately locked.
`active`, `trialing`, `null`, and unknown statuses retain their existing
allow/fail-open behavior.

No new database column or subscription-status enum is introduced:
`subscription_canceled_at` already exists, and grace is computed at query time.

### 3) Soft lock covers the intended mutation inventory

The existing subscription guard stays on 17 routes:

`announcements`, `assessments`, `assessments/[id]`,
`assessments/[id]/generate`, `delinquency/[unitId]/waive`, `documents`,
`documents/drafts`, `documents/drafts/[id]/publish`, `emergency-broadcasts`,
`meetings`, `onboarding/apartment`, `onboarding/condo`,
`payments/create-intent`, `residents/invite`, `stripe/connect/onboard`,
`stripe/connect/complete`, and `units`.

Wave 1b adds the guard to 14 high-impact administrator mutations:

`violations`, `violations/[id]/fine`, `violations/[id]/notice`,
`violations/[id]/resolve`, `violations/[id]/dismiss`, `arc`,
`arc/[id]/decide`, `arc/[id]/review`, `polls`, `elections/[id]/open`,
`elections/[id]/close`, `elections/[id]/certify`, `transparency/settings`,
and `import-residents`.

This is intentionally not a blanket guard spray. Billing recovery, account and
support routes, emergency actions, webhooks/internal handlers, reads, and
resident-facing requests remain exempt. The scope locks administrative actions
that create community obligations while preserving paths needed to recover,
communicate, or exercise user rights.

### 4) Deferred behavior

`past_due` continues to allow mutations in Wave 1b. Stripe's retry/dunning
period begins with the first payment failure; locking at that point would be
stricter than the cancellation rule. Its lifecycle treatment is deferred to a
future dunning decision.

Wave 2 remains out of scope for this ADR.

## Consequences

| Type | Consequence |
|---|---|
| Positive | Paid cancellation, platform access plans, and demo grace have explicit and non-overlapping authorization rules. |
| Positive | A cancellation provides a predictable seven-day recovery window without schema churn. |
| Positive | The soft lock protects high-impact administrative mutations without blocking resident operations or recovery paths. |
| Tradeoff | `past_due` remains permissive until a dedicated dunning policy is approved. |
| Tradeoff | Route coverage is intentionally curated and must be reviewed when new high-impact admin mutations are added. |

## Verification gate

Wave 1b requires the following focused checks before merge:

```bash
pnpm --filter @propertypro/shared exec vitest run src/__tests__/paid-grace.test.ts
pnpm --filter @propertypro/web exec vitest run \
  __tests__/billing/subscription-guard-grace.test.ts \
  __tests__/billing/must-guard-routes.test.ts
pnpm --filter @propertypro/web typecheck
scripts/with-env-local.sh pnpm exec vitest run \
  apps/web/__tests__/lifecycle/cancel-grace-lock.integration.test.ts \
  --config apps/web/vitest.integration.config.ts
```
