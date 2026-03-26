# Finance Incident Runbook (M5 Recovery: Webhook/Reconciliation)

## Scope

Use this runbook for finance incidents where Stripe webhook delivery, webhook processing, or finance reconciliation is incomplete/incorrect. Primary path is `POST /api/v1/webhooks/stripe` and downstream finance processing in `processFinanceStripeEvent`.

## 1) Detection Signals

Watch for these signals before declaring incident scope:

- **Webhook health**
  - Spike in non-2xx responses or delivery retries for `/api/v1/webhooks/stripe`.
  - Growth in `stripe_webhook_events` rows with `processedAt` still `null` after expected processing window.
  - Repeated logs: `Invalid signature`, missing `STRIPE_WEBHOOK_SECRET`, or repeated exception capture for same Stripe event type.
- **Finance reconciliation symptoms**
  - Payment marked successful in Stripe but payable status/ledger not updated in app.
  - Duplicate or missing `payment`/`refund`/`fee` ledger entries after Stripe events.
  - Unexpected payable state transitions (for example, `paid -> pending` without matching refund event).
- **User-facing symptoms**
  - Residents report successful card/bank charge but balance not reduced.
  - Admin sees mismatched payment history vs Stripe Dashboard.

## 2) Replay/Reconciliation (Safe Sequence)

Follow in order; do not skip idempotency checks.

1. **Establish blast radius**
   - Identify affected community IDs, Stripe event IDs, and time window.
   - Separate single-tenant vs multi-tenant impact before recovery.
2. **Confirm idempotency fences are intact**
   - Global fence: `stripe_webhook_events.eventId` uniqueness.
   - Finance fence: `finance_stripe_webhook_events.stripeEventId` per community.
   - If event already recorded, do not force duplicate mutation replay.
3. **Replay source of truth from Stripe first**
   - Prefer Stripe Dashboard/API event replay for failed deliveries/events.
   - Preserve handler behavior: verify signature, record event, process, then set `processedAt`.
4. **Run targeted reconciliation checks**
   - For each affected Stripe event:
     - Confirm event exists in `stripe_webhook_events`.
     - Confirm `processedAt` is set when processing succeeded.
     - Confirm corresponding finance event exists in `finance_stripe_webhook_events` for finance event types (`payment_intent.succeeded`, `charge.refunded`, `charge.dispute.created`).
     - Validate payable status and expected ledger delta (`payment`, `refund`, `fee`, `adjustment`) for the same payable/source IDs.
5. **Verify recovery outcome**
   - No remaining affected events stuck with `processedAt = null`.
   - Replayed events do not create duplicate finance mutations.
   - Sample affected communities show Stripe state and app ledger/payable state in sync.

## 3) Rollback and Safety Notes

- **Tenant isolation first:** scope every investigation and remediation by `community_id`; do not run cross-tenant recovery logic without explicit approval.
- **No direct production SQL mutation unless approved:** use application/webhook replay paths first. Direct DB writes are break-glass only with incident commander approval.
- **Contain blast radius:** pause or guard only impacted write paths if needed; keep unaffected communities operating.
- **Do not bypass webhook safety contracts:** no signature bypass, no manual duplicate insertion into idempotency tables, no forced re-processing that ignores unique constraints.
- **Preserve auditability:** capture event IDs, community IDs, and operator actions in incident notes.

## 4) Incident Taxonomy -> Action Map

- **T1: Delivery failure (webhook not reaching app)**
  - Actions: validate endpoint health/config, restore 2xx path, replay missed Stripe events, verify `processedAt` completion.
- **T2: Handler failure after ingest (`processedAt` remains `null`)**
  - Actions: fix handler/runtime error, redeploy, replay affected event IDs, verify idempotent completion.
- **T3: Finance reconciliation gap (event processed, finance state wrong/missing)**
  - Actions: confirm `finance_stripe_webhook_events` dedupe state, reconcile payable + ledger by event, replay only missing idempotent events.
- **T4: Duplicate mutation concern**
  - Actions: verify duplicate source/event IDs and unique constraints, stop manual replays, reconcile by event lineage before any corrective adjustment.
- **T5: Multi-tenant propagation risk**
  - Actions: halt broad remediations, narrow to impacted communities, require explicit approval for cross-tenant/backfill operations.

## Exit Criteria

- Webhook delivery and processing stable (no abnormal retry/error pattern).
- All known affected Stripe events reconciled with correct app finance state.
- No unresolved `processedAt = null` backlog for the incident window.
- Incident record includes root cause, affected communities, replay set, and follow-up test gaps.
