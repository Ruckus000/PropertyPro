# Spec: P2-39 — Condo Onboarding Wizard

> Build the guided onboarding wizard for condo/HOA communities with statutory document upload guidance.

## Phase
2 — Multi-Tenancy & Self-Service

## Priority
P1

## Dependencies
- P2-35
- P1-09

## Functional Requirements
- Multi-step wizard shown after first admin login
- Steps: community profile (name, address, logo, timezone), statutory document upload (guided through required categories from compliance checklist), unit roster, first resident invitation (optional)
- Progress indicator
- Highlights which documents are legally required
- Can be skipped and returned to later

## Acceptance Criteria
- [ ] Wizard appears for condo/HOA communities
- [ ] Statutory categories listed with requirement descriptions
- [ ] Documents uploaded link to compliance checklist items
- [ ] Can skip and resume
- [ ] pnpm test passes

## Technical Notes
- Integrate with compliance checklist from P1-09
- Only show for condo/HOA community types
- Emphasize legal requirements throughout

## Files Expected
- apps/web/src/app/onboarding/condo/page.tsx
- apps/web/src/components/onboarding/condo-wizard.tsx
- apps/web/src/components/onboarding/steps/statutory-documents-step.tsx
- apps/web/src/components/onboarding/steps/profile-step.tsx
- apps/web/src/components/onboarding/steps/unit-roster-step.tsx
- apps/web/src/lib/actions/onboarding.ts

## Attempts
0
