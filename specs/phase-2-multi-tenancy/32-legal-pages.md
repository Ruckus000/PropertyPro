# Spec: P2-32 — Legal Pages

> Create the Terms of Service and Privacy Policy pages as static markdown-rendered routes.

## Phase
2 — Multi-Tenancy & Self-Service

## Priority
P1

## Dependencies
- P0-00

## Functional Requirements
- /legal/terms: covers service description, user obligations, data handling, limitation of liability for compliance failures, subscription terms, cancellation, acceptable use
- Includes disclaimer: "PropertyPro helps you organize and publish documents required by Florida Statutes §718 and §720. This platform does not constitute legal advice."
- /legal/privacy: covers data collection, storage (Supabase/AWS), access, retention, deletion, cookies, third-party services (Stripe, Resend, Sentry)
- Tracks effective date
- Linked from marketing page footer and signup form

## Acceptance Criteria
- [ ] Both pages render from markdown content
- [ ] Effective date displayed
- [ ] Linked from marketing footer and signup form
- [ ] pnpm test passes

## Technical Notes
- These are legal placeholder templates — user needs an actual attorney to review before launch
- Mark clearly as DRAFT

## Files Expected
- apps/web/src/app/legal/terms/page.tsx
- apps/web/src/app/legal/privacy/page.tsx
- apps/web/src/content/legal/terms.md
- apps/web/src/content/legal/privacy.md

## Attempts
0
