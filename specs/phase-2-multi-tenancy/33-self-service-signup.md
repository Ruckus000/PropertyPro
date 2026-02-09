# Spec: P2-33 — Self-Service Signup

> Build the self-service signup form that collects community details and creates a user account.

## Phase
2 — Multi-Tenancy & Self-Service

## Priority
P0

## Dependencies
- P2-31
- P0-04

## Functional Requirements
- Signup form: community name, address, county, unit count, community type (Condo §718 / HOA §720 / Apartment)
- Primary contact name, email
- Plan selection adapts to community type
- Community type selection changes visible pricing tiers
- Subdomain auto-suggested from community name (with availability check)
- Email uniqueness validation
- Terms of Service acceptance checkbox
- Creates user via supabase.auth.signUp
- Sends confirmation email
- After email confirmation, proceeds to payment

## Acceptance Criteria
- [ ] Form validates all required fields
- [ ] Community type selection changes pricing options
- [ ] Subdomain availability check works
- [ ] User account created in Supabase Auth
- [ ] Confirmation email sent
- [ ] Cannot proceed without Terms acceptance
- [ ] pnpm test passes

## Technical Notes
- Subdomain availability check must query community table
- Separate signup flow from onboarding wizard
- Email confirmation is prerequisite for payment

## Files Expected
- apps/web/src/app/(auth)/signup/page.tsx
- apps/web/src/components/signup/signup-form.tsx
- apps/web/src/components/signup/community-type-selector.tsx
- apps/web/src/components/signup/subdomain-checker.tsx
- apps/web/src/lib/actions/signup.ts

## Attempts
0
