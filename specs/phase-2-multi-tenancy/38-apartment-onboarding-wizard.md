# Spec: P2-38 — Apartment Onboarding Wizard

> Build the guided onboarding wizard for apartment communities with unit setup and rules upload.

## Phase
2 — Multi-Tenancy & Self-Service

## Priority
P1

## Dependencies
- P2-35
- P2-36
- P2-37

## Functional Requirements
- Multi-step wizard shown after first admin login
- Steps: community profile (name, address, logo, timezone), unit roster (add units with number, floor, bedrooms, bathrooms, sqft, rent amount), rules document upload, first tenant invitation (optional)
- Progress indicator
- Can be skipped and returned to later
- Saves progress between steps

## Acceptance Criteria
- [ ] Wizard appears on first admin login for apartment communities
- [ ] Each step saves data correctly
- [ ] Can skip and resume
- [ ] Unit roster populated after completion
- [ ] pnpm test passes

## Technical Notes
- Persist wizard state to database to allow resuming
- Only show for apartment community type
- Consider showing tips/help text for each step

## Files Expected
- apps/web/src/app/onboarding/apartment/page.tsx
- apps/web/src/components/onboarding/apartment-wizard.tsx
- apps/web/src/components/onboarding/steps/profile-step.tsx
- apps/web/src/components/onboarding/steps/units-step.tsx
- apps/web/src/components/onboarding/steps/rules-step.tsx
- apps/web/src/lib/actions/onboarding.ts

## Attempts
0
