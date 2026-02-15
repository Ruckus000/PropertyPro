# Spec: P2-41 — Email Notifications

> Build the email notification system that sends targeted emails while respecting user preferences.

## Phase
2 — Multi-Tenancy & Self-Service

## Priority
P1

## Dependencies
- P1-28
- P1-26

## Functional Requirements
- Email triggers: welcome email (on provisioning), meeting notice (on meeting creation, condo/HOA), compliance alert (on overdue item, admin only), announcement blast (on publish if opted in), maintenance update (on status change)
- Each trigger checks notification_preferences before sending
- Use React Email templates from packages/email
- Include community branding (name, logo)
- Include List-Unsubscribe header
- Password reset and invitation emails bypass preferences

## Acceptance Criteria
- [ ] Meeting notice sends only to users with email_meeting_notices=true
- [ ] Announcement blast skips users with email_announcements=false
- [ ] Password reset always sends regardless of preferences
- [ ] Emails include correct community branding
- [ ] pnpm test passes

## Technical Notes
- Implement preference checks in email service layer
- Use Resend for email delivery
- Add List-Unsubscribe header per RFC 8058

## Files Expected
- packages/email/src/templates/meeting-notice.tsx
- packages/email/src/templates/compliance-alert.tsx
- packages/email/src/templates/announcement-blast.tsx
- packages/email/src/templates/maintenance-update.tsx
- apps/api/src/services/email-service.ts
- apps/api/src/lib/notification-preferences.ts

## Attempts
1
