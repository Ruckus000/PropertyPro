# Spec: P2-34 — Stripe Integration

> Integrate Stripe for subscription billing with checkout sessions and idempotent webhook handling.

## Phase
2 — Multi-Tenancy & Self-Service

## Priority
P0

## Dependencies
- P2-33

## Functional Requirements
- Create Stripe products and prices for each plan tier
- Create Checkout Session only after signup form completion + email verification from `P2-33`
- Checkout Session metadata must include `signupRequestId` from `P2-33` pending signup payload
- Checkout Session metadata should also include canonical context needed by provisioning handoff (`communityType`, `selectedPlan`, `candidateSlug`)
- Webhook endpoint at /api/v1/webhooks/stripe
- Handle checkout.session.completed event
- Verify webhook signatures
- Make handlers idempotent using two layers:
  - transport idempotency: dedupe by Stripe event ID
  - business idempotency: dedupe provisioning by `signupRequestId`
- Fetch latest state from Stripe API inside handler
- Handle subscription.created, subscription.updated, subscription.deleted events
- On checkout completion, webhook must pass `signupRequestId` into `P2-35` provisioning trigger
- Store Stripe customer_id and subscription_id on community record after provisioning creates/links the community

## Acceptance Criteria
- [ ] Checkout session redirects to Stripe payment page
- [ ] Checkout session includes required `signupRequestId` metadata
- [ ] Successful payment triggers webhook
- [ ] Webhook validates `signupRequestId` metadata presence before provisioning handoff
- [ ] Webhook processes correctly (community provisioned through `P2-35`)
- [ ] Duplicate webhook events don't create duplicate resources
- [ ] Duplicate paid events for the same `signupRequestId` do not create duplicate communities/provisioning side effects
- [ ] Invalid signatures rejected
- [ ] Subscription status tracked in database
- [ ] pnpm test passes

## Technical Notes
- Webhooks can fail, be delayed, arrive out of order
- Always idempotent at both event level (Stripe event ID) and signup level (`signupRequestId`)
- Always verify signatures
- Fetch latest state from Stripe API
- `signupRequestId` is the cross-spec handoff contract: `P2-33` issues it, `P2-34` carries it in checkout/webhook metadata, `P2-35` uses it as provisioning idempotency key

## Files Expected
- apps/web/src/app/api/v1/webhooks/stripe/route.ts
- apps/web/src/lib/actions/checkout.ts
- apps/web/src/lib/services/stripe-service.ts
- packages/db/src/schema/subscriptions.ts

## Attempts
0
