-- Drop three dead tables: access_requests, calendar_sync_tokens,
-- accounting_connections.
--
-- WHAT THEY WERE
--
-- access_requests held the public "request access" signups. The submit flow
-- was deleted in #1391 and the manager review side in #1393; until this
-- migration's own PR, the Directory's portal-status query still read approved
-- rows from it, which is why this is a CONTRACT migration: apply it only after
-- that code is live, or the Directory's resident list 500s.
--
-- calendar_sync_tokens and accounting_connections held OAuth tokens for the
-- Google Calendar and QuickBooks/Xero connectors, whose routes and services
-- were deleted in #1380. Nothing has read or written them since.
--
-- PRE-DROP CHECKS (production, read-only, 2026-10-21)
--
--   0 rows in all three. No inbound FKs, no views and no functions reference
--   them.
--
-- CASCADE removes what each table owns: its four policies, the
-- pp_rls_enforce_tenant_scope trigger, its indexes and id sequence, and its
-- outbound FKs (to communities; also users for access_requests and
-- calendar_sync_tokens, and units for access_requests). IF EXISTS keeps a
-- re-run harmless.
--
-- Dropping those FKs locks `communities`, `users` and `units`, which nearly
-- every request reads. Behind a long-running reader the lock would queue all
-- app traffic, so give up after 5s and let the operator re-run it (the 0077 /
-- 0091 pattern; the drops are idempotent).
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
DROP TABLE IF EXISTS "public"."access_requests" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "public"."calendar_sync_tokens" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "public"."accounting_connections" CASCADE;
