# Spec: P1-20 — Invitation Auth Flow

> Implement invitation-based credential delivery where admins invite residents via email to set their own passwords.

## Phase
1 — Compliance Core

## Priority
P1

## Dependencies
- P1-18
- P0-04

## Functional Requirements
- Admin triggers invitation via Resend (not Supabase built-in email)
- Use `supabase.auth.admin.generateLink({ type: 'invite' })` to get magic link URL
- Embed link in custom-branded React Email template with community name
- User clicks link → arrives at /auth/accept-invite → Supabase creates session → "Set Your Password" form
- User calls `supabase.auth.updateUser({ password })`
- Account activates
- user_roles record (created during invite) links user to community

## Acceptance Criteria
- [ ] Invitation email sent via Resend with correct community branding
- [ ] Magic link resolves to set-password page
- [ ] Password set successfully activates account
- [ ] User can log in with new password
- [ ] User sees correct community dashboard
- [ ] `pnpm test` passes

## Technical Notes
- Resend sendEmail for deliverability over Supabase built-in
- Customize email with community name via user_metadata
- Magic link expires after 24 hours (Supabase default)
- Set correct redirect_to in generateLink call
- User_roles created BEFORE invitation sent

## Files Expected
- apps/api/src/routes/invitations.ts (send invitation endpoint)
- packages/email/src/invitation-email.tsx (React Email template)
- apps/web/src/app/auth/accept-invite/page.tsx
- apps/web/src/components/set-password-form.tsx
- apps/api/src/__tests__/invitations.test.ts

## Attempts
0
