# Spec: P1-26 — Notification Preferences

> Build the notification preferences UI and enforce preference checking before sending emails.

## Phase
1 — Compliance Core

## Priority
P1

## Dependencies
- P0-05
- P1-18

## Functional Requirements
- Profile/Settings page with toggleable notification preferences: email_announcements, email_maintenance_updates, email_meeting_notices (condo/HOA only), email_compliance_alerts (admin only)
- All default to true
- Created automatically when user_role created
- Email-sending logic checks relevant preference
- Exception: password reset and invitation emails always sent regardless
- Meeting notices preference only visible to condo/HOA users
- Compliance alerts preference only visible to admin roles

## Acceptance Criteria
- [ ] Preferences page shows correct toggles per role and community type
- [ ] Toggling preference updates database
- [ ] Email send function respects preference (mocked email test)
- [ ] Password reset bypasses preferences
- [ ] `pnpm test` passes

## Technical Notes
- Create notification_preferences record in user_role creation (P1-18)
- Preference schema: user_id, community_id, preference_key, value (boolean)
- Email send functions: check preference before calling Resend
- Whitelist password_reset and invitation as always-send types
- Show/hide UI fields based on role + community_type using access policy

## Files Expected
- packages/db/src/schema.ts (add notification_preferences table)
- apps/web/src/app/(authenticated)/settings/page.tsx
- apps/web/src/components/notification-preferences.tsx
- apps/api/src/utils/email-preferences.ts (preference checker)
- apps/api/src/__tests__/notification-preferences.test.ts

## Attempts
0
