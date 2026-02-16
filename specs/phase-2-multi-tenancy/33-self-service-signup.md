# Spec: P2-33 — Self-Service Signup

> Build the self-service signup flow that captures signup intent, verifies email, and hands off to billing without prematurely provisioning a tenant.

## Phase
2 — Multi-Tenancy & Self-Service

## Priority
P0

## Dependencies
- P2-31
- P0-04

## Functional Requirements
- Canonical route for signup UI is `/signup` (marketing CTAs and tests must target this route)
- Signup form collects: primary contact name, email, password, community name, address, county, unit count, community type (`condo_718` / `hoa_720` / `apartment`), plan selection, Terms acceptance
- Plan selection adapts to selected community type and updates visible pricing tiers
- Subdomain is auto-suggested from community name (normalized lowercase + hyphenated slug)
- Subdomain availability is checked in real time (debounced) for UX and re-checked authoritatively on submit
- Reserved subdomains are rejected (`admin`, `api`, `www`, `mobile`, `pm`, `app`, `dashboard`, `login`, `signup`, `legal`)
- Email uniqueness is validated with non-enumerating error behavior
- Creates or links Supabase Auth account via `supabase.auth.signUp` (idempotent behavior for repeated submissions)
- Sends email verification link via controlled email flow (Resend-backed delivery path)
- Persists a pending signup payload (`signupRequestId`, selected plan, community type, candidate slug, profile inputs) for checkout handoff
- After email confirmation, user can proceed to payment (`P2-34` checkout)
- Lifecycle boundary: does not create `communities` or `user_roles` in `P2-33`; tenant provisioning remains in `P2-35`

## Acceptance Criteria
- [ ] Form validates all required fields
- [ ] Community type selection changes pricing options
- [ ] Subdomain availability check works and submit path performs server-authoritative revalidation
- [ ] Reserved subdomains are rejected with clear validation errors
- [ ] User account created in Supabase Auth
- [ ] Confirmation email sent and email verification is required before checkout
- [ ] Cannot proceed without Terms acceptance
- [ ] Duplicate submit for same signup identity/request does not create duplicate pending signup payload
- [ ] Signup completion (pre-payment) does not create `communities` or `user_roles` rows
- [ ] pnpm test passes

## Technical Notes
- Use a shared slug normalization utility for suggestion + server validation to avoid client/server drift
- Subdomain availability check must query communities but is advisory only; submit-time uniqueness check is authoritative
- Separate signup flow from onboarding wizard
- Email confirmation is prerequisite for payment
- Preserve `signupRequestId` across verification -> checkout handoff for idempotency and traceability
- Keep contract alignment with `P2-35`: community and role creation occur after payment in provisioning pipeline

## Files Expected
- apps/web/src/app/(auth)/signup/page.tsx
- apps/web/src/components/signup/signup-form.tsx
- apps/web/src/components/signup/community-type-selector.tsx
- apps/web/src/components/signup/subdomain-checker.tsx
- apps/web/src/lib/auth/signup.ts
- apps/web/src/lib/auth/signup-schema.ts
- apps/web/src/app/api/v1/auth/signup/route.ts

## Attempts
0
