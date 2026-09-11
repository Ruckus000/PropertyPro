-- WHY: the admin console has an inbox but no work queue. A support thread
-- (0068) records what somebody SAID; nothing in the platform records what we
-- are going to DO about it, or about the many problems nobody wrote in about
-- at all — a stalled Stripe sync, a community stuck mid-publish. Wave 3 of the
-- console redesign adds that queue, and these are its two tables.
--
-- Ticket and thread are deliberately NOT the same row. `thread_id` is nullable
-- because most tickets are opened by an operator noticing something, and
-- `ON DELETE SET NULL` because deleting a conversation must not delete the
-- record of the work it caused. `community_id` is nullable for the stronger
-- reason: it is CONTEXT, not scope. A ticket may be about a community, but the
-- only people who can read any ticket are platform admins with no membership
-- in it, so scoping this table on that column would hide every row from its
-- sole audience. `ON DELETE SET NULL` there too, for the same
-- do-not-erase-the-history reason.
--
-- The `priority`, `category`, `status` and `kind` CHECK constraints below
-- MIRROR the closed sets in packages/shared/src/support-tickets.ts. SQL cannot
-- import TypeScript, so that duplication is unavoidable — exactly as 0068
-- records for the inbox's mailbox/status sets. Changing a value means changing
-- both, and nothing but review enforces it.
--
-- `support_tickets_title_check` is a bound, not decoration. `title` is NOT NULL
-- but the empty string satisfies that, and a queue row with no title is neither
-- clickable nor searchable; the 200-character ceiling stops one pasted stack
-- trace from dominating the list.
--
-- `support_ticket_events.ticket_id` is the one CASCADE here, and the contrast
-- with the two SET NULLs above is intentional: an event has no meaning without
-- its ticket, so it goes with it rather than becoming an orphan no query can
-- reach.
CREATE TABLE "support_ticket_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ticket_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"body" text,
	"actor_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_ticket_events_kind_check" CHECK ("support_ticket_events"."kind" IN ('created','note','status_changed','priority_changed','assigned','linked'))
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"community_id" bigint,
	"thread_id" bigint,
	"external_ref" text,
	"assignee_user_id" uuid,
	"created_by" uuid NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_tickets_priority_check" CHECK ("support_tickets"."priority" IN ('low','medium','high')),
	CONSTRAINT "support_tickets_category_check" CHECK ("support_tickets"."category" IN ('billing','compliance','site','access','other')),
	CONSTRAINT "support_tickets_status_check" CHECK ("support_tickets"."status" IN ('open','waiting','resolved')),
	CONSTRAINT "support_tickets_title_check" CHECK (char_length("support_tickets"."title") BETWEEN 1 AND 200)
);
--> statement-breakpoint
ALTER TABLE "support_ticket_events" ADD CONSTRAINT "support_ticket_events_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_thread_id_support_inbox_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."support_inbox_threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_ticket_events_ticket_idx" ON "support_ticket_events" USING btree ("ticket_id","id");--> statement-breakpoint
CREATE INDEX "support_tickets_status_priority_idx" ON "support_tickets" USING btree ("status","priority","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "support_tickets_thread_idx" ON "support_tickets" USING btree ("thread_id") WHERE "support_tickets"."thread_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "support_tickets_community_idx" ON "support_tickets" USING btree ("community_id") WHERE "support_tickets"."community_id" IS NOT NULL;
--> statement-breakpoint
-- Platform-table lockdown, the 0068 posture verbatim (which is 0053's, which is
-- 0038's: users, pending_signups, stripe_webhook_events, marketing_leads).
--
-- Neither table is tenant-scoped, and that is the point rather than an
-- omission. `support_tickets.community_id` exists but is nullable context — see
-- the header — so there is no tenant to scope by, no `community_id` on the
-- events table at all, and no write-scope trigger to install.
--
-- ZERO POLICIES IS THE DENY-EVERYONE DEFAULT, not an oversight. Access works
-- because the legitimate writer holds rolbypassrls, and BYPASSRLS outranks
-- FORCE: the admin console over service_role via createAdminTypedClient(),
-- behind requirePlatformAdmin().
--
-- The REVOKEs are defence in depth and they are load-bearing here. The anon key
-- ships in the browser bundle, and both `description` and an event `body` are
-- free text an operator will paste customer details, addresses and account
-- identifiers into while triaging. Supabase's vestigial grants would make every
-- one of those notes readable by an unauthenticated caller. The SEQUENCE grants
-- are revoked alongside the table for the reason 0053 records: leaving the
-- sequence open makes the table look locked down while an INSERT path stays
-- reachable.
ALTER TABLE IF EXISTS "public"."support_tickets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."support_tickets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE support_tickets FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE support_tickets_id_seq FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE support_tickets TO service_role;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE support_tickets_id_seq TO service_role;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."support_ticket_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."support_ticket_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE support_ticket_events FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE support_ticket_events_id_seq FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE support_ticket_events TO service_role;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE support_ticket_events_id_seq TO service_role;
