-- WHY: wave 4 of the admin console redesign gives each platform admin a
-- notification tray, alert opt-ins and (optionally) Web Push on an installed
-- PWA. All three need state that belongs to ONE OPERATOR rather than to the
-- platform, and none of it has anywhere to live today: `user_preferences` is a
-- tenant-app table for residents and managers, and console signals are derived
-- per request from live data rather than stored, so there is no per-item row to
-- mark read. These are the two tables that state needs.
--
-- `platform_admin_preferences` is keyed on `user_id` ITSELF — no surrogate id,
-- no sequence — because an operator has exactly one row or none. That is what
-- makes the console's write a plain upsert with no read-then-write race, and it
-- is why only the second table below needs a sequence revoke.
--
-- `notifications_read_at` is a WATERMARK, not a per-item flag: "unread" means
-- "surfaced after this instant". Nullable, because never having marked anything
-- read is a real state and is not the same as having marked everything read at
-- the epoch.
--
-- The two jsonb CHECKs are not decoration. NOT NULL admits `'null'::jsonb`,
-- `'[]'::jsonb` and `'3'::jsonb` — a jsonb null is a VALUE, not SQL NULL — so
-- without them every reader would re-derive the shape and one bad write would
-- be permanent. `alert_prefs` is an object (per-category opt-ins plus an error
-- spike threshold); `push_sent_fingerprints` is an array of content hashes of
-- alerts already delivered, which is what stops the signal cron re-notifying
-- the same stalled sync on every tick.
--
-- `platform_admin_push_subscriptions` is one row per BROWSER, not per admin:
-- the Push API mints a subscription per service-worker registration, so a
-- laptop and a phone are legitimately two rows. `endpoint` carries the UNIQUE
-- constraint because it is the natural key — re-subscribing from the same
-- browser must UPDATE rather than accumulate duplicates that each deliver the
-- same notification.
--
-- `platform_admin_push_subscriptions_endpoint_https` is a bound on where we
-- will send, not a format nicety. The Push API only ever issues https
-- endpoints and web-push will POST to whatever string it is handed, so the
-- CHECK turns a bad row into a failed INSERT instead of an outbound request to
-- an attacker-chosen host.
--
-- Neither table has a `community_id`, and that is the premise rather than an
-- omission: a platform admin holds no community membership, so there is no
-- tenant to scope by and no write-scope trigger to install. There is also no FK
-- to users/auth.users — cross-schema FKs to auth.users cannot be expressed in
-- drizzle, and `platform_admin_audit_log.admin_user_id` records the same
-- choice.
CREATE TABLE "platform_admin_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"notifications_read_at" timestamp with time zone,
	"alert_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"push_sent_fingerprints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_admin_preferences_alert_prefs_object" CHECK (jsonb_typeof("platform_admin_preferences"."alert_prefs") = 'object'),
	CONSTRAINT "platform_admin_preferences_fingerprints_array" CHECK (jsonb_typeof("platform_admin_preferences"."push_sent_fingerprints") = 'array')
);
--> statement-breakpoint
CREATE TABLE "platform_admin_push_subscriptions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "platform_admin_push_subscriptions_endpoint_unique" UNIQUE("endpoint"),
	CONSTRAINT "platform_admin_push_subscriptions_endpoint_https" CHECK ("platform_admin_push_subscriptions"."endpoint" LIKE 'https://%')
);
--> statement-breakpoint
CREATE INDEX "platform_admin_push_subscriptions_user_idx" ON "platform_admin_push_subscriptions" USING btree ("user_id");
--> statement-breakpoint
-- Platform-table lockdown, the 0072 posture verbatim (which is 0068's, which is
-- 0053's, which is 0038's: users, pending_signups, stripe_webhook_events,
-- marketing_leads).
--
-- ZERO POLICIES IS THE DENY-EVERYONE DEFAULT, not an oversight. Access works
-- because the legitimate writer holds rolbypassrls, and BYPASSRLS outranks
-- FORCE: the admin console over service_role via createAdminTypedClient(),
-- behind requirePlatformAdmin().
--
-- The REVOKEs are defence in depth and they are load-bearing. The anon key
-- ships in the browser bundle. `platform_admin_preferences` maps a named
-- operator to what they watch and what they have already been told; a push
-- subscription's `endpoint` + `p256dh` + `auth` are together enough for anyone
-- holding them to deliver a notification to that operator's device. Supabase's
-- vestigial grants would leave both readable by an unauthenticated caller.
--
-- ONLY the push table gets a SEQUENCE revoke, and the asymmetry is deliberate
-- rather than an omission: `platform_admin_preferences` is keyed on `user_id`
-- with no bigserial, so it HAS no sequence. Where there is one, revoking the
-- table alone would leave it looking locked down while an INSERT path stayed
-- reachable — the trap 0053 recorded.
ALTER TABLE IF EXISTS "public"."platform_admin_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."platform_admin_preferences" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE platform_admin_preferences FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE platform_admin_preferences TO service_role;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."platform_admin_push_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."platform_admin_push_subscriptions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE platform_admin_push_subscriptions FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE platform_admin_push_subscriptions_id_seq FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE platform_admin_push_subscriptions TO service_role;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE platform_admin_push_subscriptions_id_seq TO service_role;
