# Spec: P1-21 — Password Reset Flow

> Implement the password reset flow using Supabase Auth with proper redirect handling.

## Phase
1 — Compliance Core

## Priority
P1

## Dependencies
- P0-04

## Functional Requirements
- "Forgot Password" link on login page
- Calls supabase.auth.resetPasswordForEmail(email, { redirectTo })
- User receives reset email, clicks link → /auth/reset-password with session token
- "New Password" form calls supabase.auth.updateUser({ password })
- Redirect to dashboard on success
- Rate limit reset requests (prevent email enumeration)

## Acceptance Criteria
- [ ] Reset email sent to valid email addresses
- [ ] Reset link resolves correctly
- [ ] New password works for subsequent login
- [ ] Invalid/expired tokens show clear error
- [ ] `pnpm test` passes

## Technical Notes
- Supabase handles email sending via built-in mailer (no Resend for this flow)
- Reset link expires after 1 hour
- Implement rate limiting: max 5 reset requests per email per hour
- Show generic success message to prevent email enumeration

## Files Expected
- apps/web/src/app/auth/forgot-password/page.tsx
- apps/web/src/app/auth/reset-password/page.tsx
- apps/web/src/components/forgot-password-form.tsx
- apps/web/src/components/reset-password-form.tsx
- apps/api/src/middleware/rate-limit.ts (reuse from existing)
- apps/web/src/__tests__/password-reset.test.tsx

## Attempts
0
