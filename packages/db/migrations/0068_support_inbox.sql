-- WHY: getpropertypro.com has no MX record, so support@ / privacy@ / contact@ --
-- all hard-bounce today even though the first two are published on the contact
-- page, the marketing footer, the accessibility page and the privacy policy
-- (launch blocker #3). These two tables hold the conversations once Forward
-- Email starts POSTing them to /api/v1/webhooks/inbound-email.
--
-- The `mailbox` and `status` CHECK constraints below MIRROR the closed sets in
-- packages/shared/src/support-inbox.ts. SQL cannot import TypeScript, so that
-- duplication is unavoidable: changing a mailbox or a status means changing
-- both, and nothing but review enforces it.
--
-- support_inbox_messages_kind_shape_check is load-bearing, not defensive
-- tidiness. Internal notes share this table with emails so the thread timeline
-- is one index scan instead of a re-sorted UNION; the constraint is what makes
-- "a private note can never be emailed to the customer" a property of the
-- database rather than a promise about the code, by denying a kind='note' row
-- any address field at all.
--
-- support_inbox_messages_dedupe_key_key (UNIQUE) is the idempotency fence that
-- makes a provider redelivery a no-op. Deliberately NOT UNIQUE(rfc_message_id):
-- Message-ID is an optional header, Postgres treats NULLs as distinct, and a
-- header-less message would therefore defeat that constraint silently.
CREATE TABLE "support_inbox_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"thread_id" bigint NOT NULL,
	"kind" text DEFAULT 'email' NOT NULL,
	"direction" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"rfc_message_id" text,
	"in_reply_to" text,
	"references_ids" text[],
	"delivered_to" text,
	"from_email" text,
	"from_name" text,
	"to_emails" text[],
	"cc_emails" text[],
	"subject" text,
	"text_body" text,
	"html_body" text,
	"sent_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"has_attachments" boolean DEFAULT false NOT NULL,
	"raw_payload" jsonb,
	"normalization_status" text DEFAULT 'ok' NOT NULL,
	"provider_message_id" text,
	"author_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_inbox_messages_kind_shape_check" CHECK ((
        "support_inbox_messages"."kind" = 'email'
        AND "support_inbox_messages"."direction" IN ('inbound','outbound')
        AND "support_inbox_messages"."from_email" IS NOT NULL
      ) OR (
        "support_inbox_messages"."kind" = 'note'
        AND "support_inbox_messages"."direction" = 'internal'
        AND "support_inbox_messages"."from_email" IS NULL
        AND "support_inbox_messages"."rfc_message_id" IS NULL
        AND "support_inbox_messages"."to_emails" IS NULL
        AND "support_inbox_messages"."author_user_id" IS NOT NULL
      )),
	CONSTRAINT "support_inbox_messages_normalization_status_check" CHECK ("support_inbox_messages"."normalization_status" IN ('ok','failed')),
	CONSTRAINT "support_inbox_messages_dedupe_key_check" CHECK (char_length("support_inbox_messages"."dedupe_key") = 64)
);
--> statement-breakpoint
CREATE TABLE "support_inbox_threads" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"mailbox" text NOT NULL,
	"subject" text NOT NULL,
	"normalized_subject" text NOT NULL,
	"participant_email" text NOT NULL,
	"participant_name" text,
	"status" text DEFAULT 'open' NOT NULL,
	"first_message_at" timestamp with time zone NOT NULL,
	"last_message_at" timestamp with time zone NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_inbox_threads_mailbox_check" CHECK ("support_inbox_threads"."mailbox" IN ('support','privacy','contact')),
	CONSTRAINT "support_inbox_threads_status_check" CHECK ("support_inbox_threads"."status" IN ('open','pending','closed','spam')),
	CONSTRAINT "support_inbox_threads_message_count_check" CHECK ("support_inbox_threads"."message_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "support_inbox_messages" ADD CONSTRAINT "support_inbox_messages_thread_id_support_inbox_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."support_inbox_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "support_inbox_messages_dedupe_key_key" ON "support_inbox_messages" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "support_inbox_messages_thread_idx" ON "support_inbox_messages" USING btree ("thread_id","id");--> statement-breakpoint
CREATE INDEX "support_inbox_messages_rfc_message_id_idx" ON "support_inbox_messages" USING btree ("rfc_message_id") WHERE "support_inbox_messages"."rfc_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "support_inbox_threads_mailbox_status_idx" ON "support_inbox_threads" USING btree ("mailbox","status","last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "support_inbox_threads_participant_idx" ON "support_inbox_threads" USING btree ("participant_email");
--> statement-breakpoint
-- Platform-table lockdown, same posture as 0038/0053 (users, pending_signups,
-- stripe_webhook_events, marketing_leads).
--
-- Neither table is tenant-scoped and that is the point rather than an omission:
-- whoever writes to support@ is usually not a member of any community, and
-- often not a user at all, so there is no community_id to scope by and no
-- write-scope trigger to install.
--
-- ZERO POLICIES IS THE DENY-EVERYONE DEFAULT, not an oversight. Access works
-- because both legitimate writers hold rolbypassrls, and BYPASSRLS outranks
-- FORCE:
--   * the web ingress over the privileged Drizzle connection (DATABASE_URL ->
--     `postgres`), which inserts threads and inbound messages;
--   * the admin console over service_role via createAdminTypedClient(), which
--     reads threads, updates status and inserts replies and notes.
--
-- The REVOKEs are defence in depth, and they matter more here than usual. The
-- anon key ships in the browser bundle; support_inbox_messages holds raw,
-- unsanitized sender HTML plus a raw_payload column carrying quarantined
-- message bodies belonging to third parties. Leaving Supabase's vestigial
-- grants in place would expose every support conversation, including anything
-- sent to privacy@, to an unauthenticated reader.
ALTER TABLE IF EXISTS "public"."support_inbox_threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."support_inbox_threads" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE support_inbox_threads FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE support_inbox_threads_id_seq FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE support_inbox_threads TO service_role;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE support_inbox_threads_id_seq TO service_role;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."support_inbox_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."support_inbox_messages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE support_inbox_messages FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE support_inbox_messages_id_seq FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE support_inbox_messages TO service_role;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE support_inbox_messages_id_seq TO service_role;
