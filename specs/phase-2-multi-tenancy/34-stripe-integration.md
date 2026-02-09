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
- Create Checkout Session after signup form + email verification
- Webhook endpoint at /api/webhooks/stripe
- Handle checkout.session.completed event
- Verify webhook signatures
- Make handlers idempotent (use Stripe event ID to deduplicate)
- Fetch latest state from Stripe API inside handler
- Handle subscription.created, subscription.updated, subscription.deleted events
- Store Stripe customer_id and subscription_id on community record

## Acceptance Criteria
- [ ] Checkout session redirects to Stripe payment page
- [ ] Successful payment triggers webhook
- [ ] Webhook processes correctly (community provisioned)
- [ ] Duplicate webhook events don't create duplicate resources
- [ ] Invalid signatures rejected
- [ ] Subscription status tracked in database
- [ ] pnpm test passes

## Technical Notes
- Webhooks can fail, be delayed, arrive out of order
- Always idempotent
- Always verify signatures
- Fetch latest state from Stripe API

## Files Expected
- apps/api/src/routes/webhooks/stripe.ts
- apps/web/src/lib/actions/checkout.ts
- apps/api/src/services/stripe-service.ts
- packages/shared/src/schema/stripe.ts

## Attempts
0
