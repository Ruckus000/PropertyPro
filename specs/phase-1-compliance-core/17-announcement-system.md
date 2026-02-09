# Spec: P1-17 — Announcement System

> Build the announcement composer with markdown editing, targeting options, and email blast capability.

## Phase
1 — Compliance Core

## Priority
P1

## Dependencies
- P0-05
- P0-06
- P0-03

## Functional Requirements
- Markdown textarea with toolbar buttons (bold, italic, link, list) — NOT a full rich-text editor
- Pin/unpin announcements
- Target audience: all, owners only, board only, tenants only
- Schedule for future publication
- Option to send email blast on publish (checks notification preferences)
- Announcements feed in resident portal: chronological, pinned items at top, rendered from markdown
- Implement cursor-based pagination

## Acceptance Criteria
- [ ] Announcement created with markdown content renders correctly
- [ ] Pinned announcements appear first in feed
- [ ] Targeting filters announcements to correct audience
- [ ] Scheduled announcements not visible until publish date
- [ ] Email blast respects notification preferences
- [ ] `pnpm test` passes

## Technical Notes
- Keep bundle small — no contentEditable-based editor
- Use a lightweight markdown editor component (e.g., remark, markdown-it)
- Render markdown safely on client with markdown-to-jsx or similar
- Email blast uses Resend with role-based filtering
- Scheduled announcements checked at query time (publish_date <= now())

## Files Expected
- packages/db/src/schema.ts (add announcements table)
- apps/api/src/routes/announcements.ts (CRUD endpoints)
- apps/web/src/components/announcement-composer.tsx
- apps/web/src/components/announcement-feed.tsx
- apps/web/src/components/announcement-toolbar.tsx
- apps/api/src/workers/announcement-email-blast.ts
- apps/api/src/__tests__/announcements.test.ts

## Attempts
0
