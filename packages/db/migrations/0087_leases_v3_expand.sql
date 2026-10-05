-- leases_v3_expand — Leases v3, EXPAND stage. Additive only: nothing is
-- dropped or rewritten, and every existing reader keeps working.
-- Plan: docs/superpowers/plans/2026-09-29-leases-v3.md
-- (No migration number in this header on purpose: production's ledger records
-- this file's sha256, so a renumber must never change its bytes.)
--
-- * Three new tenant tables: lease_residents (everyone on a lease — a user OR
--   a unit_occupants household member), lease_deposits (§83.49 record),
--   lease_renewal_offers.
-- * unit_occupants gains a (id, community_id) unique index — an index only —
--   as the target of lease_residents' same-community FK. The FK is RESTRICT:
--   Directory "Remove" (a hard delete for erasure, #1303) is refused with a
--   409 while the person is named on a lease.
-- * leases gains ending/transfer/document/zero-rent/concurrency columns.
--   resident_id becomes NULLABLE (an occupant-only primary has no user id) and
--   stays dual-written until a later CONTRACT migration drops it.
-- * units gains offline_* (E7). lease_status gains 'cancelled' — ADD VALUE is
--   safe in the migration transaction (PG >= 12) because nothing here uses it.
--
-- The three CHECKs existing lease rows could violate (end after start,
-- non-negative rent, $0 needs a reason) are NOT VALID: they bind every write
-- from now on without scanning history. Run the plan's "Validate" queries on
-- production, then VALIDATE CONSTRAINT in a follow-up. Nothing back-fills rent
-- or notice_days — null means "not recorded".
CREATE TYPE "public"."deposit_held_method" AS ENUM('separate_noninterest', 'separate_interest', 'surety_bond');--> statement-breakpoint
CREATE TYPE "public"."lease_end_via" AS ENUM('notice', 'declined', 'early', 'transfer', 'expiry');--> statement-breakpoint
CREATE TYPE "public"."lease_zero_rent_reason" AS ENUM('staff', 'courtesy_officer', 'rent_free_agreement', 'other');--> statement-breakpoint
CREATE TYPE "public"."renewal_offer_stage" AS ENUM('offer_sent', 'accepted', 'declined', 'expired', 'signed', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."unit_offline_reason" AS ENUM('storm_damage', 'renovation', 'model_unit', 'staff_unit', 'other');--> statement-breakpoint
ALTER TYPE "public"."lease_status" ADD VALUE 'cancelled';--> statement-breakpoint
CREATE TABLE "lease_residents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"lease_id" bigint NOT NULL,
	"user_id" uuid,
	"occupant_id" bigint,
	"is_primary" boolean DEFAULT false NOT NULL,
	"added_on" date NOT NULL,
	"removed_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lease_residents_exactly_one_party" CHECK (num_nonnulls("lease_residents"."user_id", "lease_residents"."occupant_id") = 1),
	CONSTRAINT "lease_residents_removed_after_added" CHECK ("lease_residents"."removed_on" IS NULL OR "lease_residents"."removed_on" >= "lease_residents"."added_on")
);
--> statement-breakpoint
CREATE TABLE "lease_deposits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"lease_id" bigint NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"held_method" "deposit_held_method",
	"depository" text,
	"received_on" date,
	"notice_sent_on" date,
	"carried_from_deposit_id" bigint,
	"disposition" text,
	"disposition_on" date,
	"claimed_amount" numeric(10, 2),
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lease_deposits_amount_not_negative" CHECK ("lease_deposits"."amount" >= 0),
	CONSTRAINT "lease_deposits_disposition" CHECK ("lease_deposits"."disposition" IS NULL OR "lease_deposits"."disposition" IN ('refunded_full', 'claim_sent', 'carried_to_transfer')),
	CONSTRAINT "lease_deposits_claim_within_amount" CHECK ("lease_deposits"."claimed_amount" IS NULL OR ("lease_deposits"."claimed_amount" >= 0 AND "lease_deposits"."claimed_amount" <= "lease_deposits"."amount"))
);
--> statement-breakpoint
CREATE TABLE "lease_renewal_offers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"lease_id" bigint NOT NULL,
	"stage" "renewal_offer_stage" DEFAULT 'offer_sent' NOT NULL,
	"offer_rent" numeric(10, 2) NOT NULL,
	"zero_rent_reason" "lease_zero_rent_reason",
	"term_months" integer,
	"custom_end_date" date,
	"start_date" date NOT NULL,
	"deposit_amount" numeric(10, 2),
	"proposed_residents" jsonb,
	"sent_on" date NOT NULL,
	"expires_on" date NOT NULL,
	"responded_on" date,
	"responded_via" text,
	"renewal_lease_id" bigint,
	"idempotency_key" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "renewal_offers_expires_before_start" CHECK ("lease_renewal_offers"."expires_on" < "lease_renewal_offers"."start_date"),
	CONSTRAINT "renewal_offers_expires_after_sent" CHECK ("lease_renewal_offers"."expires_on" >= "lease_renewal_offers"."sent_on"),
	CONSTRAINT "renewal_offers_rent_not_negative" CHECK ("lease_renewal_offers"."offer_rent" >= 0),
	CONSTRAINT "renewal_offers_zero_rent_needs_reason" CHECK ("lease_renewal_offers"."offer_rent" > 0 OR "lease_renewal_offers"."zero_rent_reason" IS NOT NULL),
	CONSTRAINT "renewal_offers_term_or_end" CHECK ("lease_renewal_offers"."term_months" IS NULL OR "lease_renewal_offers"."custom_end_date" IS NULL),
	CONSTRAINT "renewal_offers_term_range" CHECK ("lease_renewal_offers"."term_months" IS NULL OR "lease_renewal_offers"."term_months" BETWEEN 1 AND 36),
	CONSTRAINT "renewal_offers_proposed_residents_array" CHECK ("lease_renewal_offers"."proposed_residents" IS NULL OR jsonb_typeof("lease_renewal_offers"."proposed_residents") = 'array'),
	CONSTRAINT "renewal_offers_responded_via" CHECK ("lease_renewal_offers"."responded_via" IS NULL OR "lease_renewal_offers"."responded_via" IN ('manager', 'portal'))
);
--> statement-breakpoint
-- Composite FK targets. Must exist before the (x_id, community_id) FKs below.
CREATE UNIQUE INDEX "leases_id_community_uq" ON "leases" USING btree ("id","community_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unit_occupants_id_community_uq" ON "unit_occupants" USING btree ("id","community_id");--> statement-breakpoint
ALTER TABLE "leases" ALTER COLUMN "resident_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "offline_reason" "unit_offline_reason";--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "offline_note" text;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "offline_since" date;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "offline_until" date;--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "zero_rent_reason" "lease_zero_rent_reason";--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "zero_rent_note" text;--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "notice_days" integer;--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "move_out_on" date;--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "end_via" "lease_end_via";--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "end_reason" text;--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "notice_received_on" date;--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "cancelled_reason" text;--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "transferred_from_lease_id" bigint;--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "signed_document_id" bigint;--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "lease_residents" ADD CONSTRAINT "lease_residents_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_residents" ADD CONSTRAINT "lease_residents_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_residents" ADD CONSTRAINT "lease_residents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_residents" ADD CONSTRAINT "lease_residents_occupant_id_unit_occupants_id_fk" FOREIGN KEY ("occupant_id") REFERENCES "public"."unit_occupants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_residents" ADD CONSTRAINT "lease_residents_lease_same_community_fk" FOREIGN KEY ("lease_id","community_id") REFERENCES "public"."leases"("id","community_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_residents" ADD CONSTRAINT "lease_residents_occupant_same_community_fk" FOREIGN KEY ("occupant_id","community_id") REFERENCES "public"."unit_occupants"("id","community_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_deposits" ADD CONSTRAINT "lease_deposits_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_deposits" ADD CONSTRAINT "lease_deposits_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_deposits" ADD CONSTRAINT "lease_deposits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_deposits" ADD CONSTRAINT "lease_deposits_lease_same_community_fk" FOREIGN KEY ("lease_id","community_id") REFERENCES "public"."leases"("id","community_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_deposits" ADD CONSTRAINT "lease_deposits_carried_from_fk" FOREIGN KEY ("carried_from_deposit_id") REFERENCES "public"."lease_deposits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_renewal_offers" ADD CONSTRAINT "lease_renewal_offers_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_renewal_offers" ADD CONSTRAINT "lease_renewal_offers_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_renewal_offers" ADD CONSTRAINT "lease_renewal_offers_renewal_lease_id_leases_id_fk" FOREIGN KEY ("renewal_lease_id") REFERENCES "public"."leases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_renewal_offers" ADD CONSTRAINT "lease_renewal_offers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_renewal_offers" ADD CONSTRAINT "renewal_offers_lease_same_community_fk" FOREIGN KEY ("lease_id","community_id") REFERENCES "public"."leases"("id","community_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_renewal_offers" ADD CONSTRAINT "renewal_offers_renewal_lease_same_community_fk" FOREIGN KEY ("renewal_lease_id","community_id") REFERENCES "public"."leases"("id","community_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lease_residents_lease_idx" ON "lease_residents" USING btree ("lease_id");--> statement-breakpoint
CREATE INDEX "lease_residents_user_idx" ON "lease_residents" USING btree ("community_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lease_residents_lease_user_uq" ON "lease_residents" USING btree ("lease_id","user_id") WHERE user_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "lease_residents_lease_occupant_uq" ON "lease_residents" USING btree ("lease_id","occupant_id") WHERE occupant_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "lease_residents_occupant_idx" ON "lease_residents" USING btree ("occupant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lease_residents_one_primary_uq" ON "lease_residents" USING btree ("lease_id") WHERE is_primary AND removed_on IS NULL;--> statement-breakpoint
CREATE INDEX "lease_deposits_lease_idx" ON "lease_deposits" USING btree ("lease_id");--> statement-breakpoint
CREATE INDEX "renewal_offers_lease_idx" ON "lease_renewal_offers" USING btree ("lease_id");--> statement-breakpoint
CREATE UNIQUE INDEX "renewal_offers_one_open_uq" ON "lease_renewal_offers" USING btree ("lease_id") WHERE stage IN ('offer_sent', 'accepted');--> statement-breakpoint
CREATE UNIQUE INDEX "renewal_offers_idempotency_key_uq" ON "lease_renewal_offers" USING btree ("community_id","idempotency_key") WHERE idempotency_key IS NOT NULL;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_signed_document_id_documents_id_fk" FOREIGN KEY ("signed_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_transferred_from_lease_id_fk" FOREIGN KEY ("transferred_from_lease_id") REFERENCES "public"."leases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leases_unit_dates_idx" ON "leases" USING btree ("unit_id","start_date","end_date");--> statement-breakpoint
CREATE UNIQUE INDEX "leases_idempotency_key_uq" ON "leases" USING btree ("community_id","idempotency_key") WHERE idempotency_key IS NOT NULL;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_offline_reason_with_since" CHECK (("units"."offline_since" IS NULL) = ("units"."offline_reason" IS NULL));--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_offline_until_after_since" CHECK ("units"."offline_until" IS NULL OR ("units"."offline_since" IS NOT NULL AND "units"."offline_until" >= "units"."offline_since"));--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_end_after_start" CHECK ("leases"."end_date" IS NULL OR "leases"."end_date" > "leases"."start_date") NOT VALID;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_rent_not_negative" CHECK ("leases"."rent_amount" IS NULL OR "leases"."rent_amount" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_zero_rent_needs_reason" CHECK ("leases"."rent_amount" IS NULL OR "leases"."rent_amount" > 0 OR "leases"."zero_rent_reason" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_notice_days_range" CHECK ("leases"."notice_days" IS NULL OR "leases"."notice_days" BETWEEN 0 AND 60);--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_move_out_after_start" CHECK ("leases"."move_out_on" IS NULL OR "leases"."move_out_on" >= "leases"."start_date");
--> statement-breakpoint

-- ── Row level security: tenant_admin_write for the three new tables ─────────
-- SELECT needs the admin tier too (pp_rls_can_read_audit_log), like
-- unit_occupants: deposits and offers are the neighbour-data leak 0077 closed
-- for leases. Residents read their own lease through the API (service role).
ALTER TABLE IF EXISTS "public"."lease_residents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."lease_residents" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."lease_residents";--> statement-breakpoint
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.lease_residents FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_select" ON public."lease_residents";--> statement-breakpoint
CREATE POLICY "pp_tenant_select" ON public."lease_residents" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)));--> statement-breakpoint
DROP POLICY IF EXISTS "pp_lease_residents_insert" ON public."lease_residents";--> statement-breakpoint
CREATE POLICY "pp_lease_residents_insert" ON public."lease_residents" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)));--> statement-breakpoint
DROP POLICY IF EXISTS "pp_lease_residents_update" ON public."lease_residents";--> statement-breakpoint
CREATE POLICY "pp_lease_residents_update" ON public."lease_residents" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)))
  WITH CHECK (pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)));--> statement-breakpoint
DROP POLICY IF EXISTS "pp_lease_residents_delete" ON public."lease_residents";--> statement-breakpoint
CREATE POLICY "pp_lease_residents_delete" ON public."lease_residents" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)));--> statement-breakpoint
-- Data API lockdown, the 0077/0085 posture: the anon key ships in the browser.
REVOKE ALL ON TABLE public.lease_residents FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE public.lease_residents_id_seq FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lease_residents TO service_role;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE public.lease_residents_id_seq TO service_role;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."lease_deposits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."lease_deposits" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."lease_deposits";--> statement-breakpoint
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.lease_deposits FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_select" ON public."lease_deposits";--> statement-breakpoint
CREATE POLICY "pp_tenant_select" ON public."lease_deposits" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)));--> statement-breakpoint
DROP POLICY IF EXISTS "pp_lease_deposits_insert" ON public."lease_deposits";--> statement-breakpoint
CREATE POLICY "pp_lease_deposits_insert" ON public."lease_deposits" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)));--> statement-breakpoint
DROP POLICY IF EXISTS "pp_lease_deposits_update" ON public."lease_deposits";--> statement-breakpoint
CREATE POLICY "pp_lease_deposits_update" ON public."lease_deposits" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)))
  WITH CHECK (pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)));--> statement-breakpoint
DROP POLICY IF EXISTS "pp_lease_deposits_delete" ON public."lease_deposits";--> statement-breakpoint
CREATE POLICY "pp_lease_deposits_delete" ON public."lease_deposits" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)));--> statement-breakpoint
-- Data API lockdown, the 0077/0085 posture: the anon key ships in the browser.
REVOKE ALL ON TABLE public.lease_deposits FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE public.lease_deposits_id_seq FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lease_deposits TO service_role;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE public.lease_deposits_id_seq TO service_role;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."lease_renewal_offers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."lease_renewal_offers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."lease_renewal_offers";--> statement-breakpoint
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.lease_renewal_offers FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();--> statement-breakpoint
DROP POLICY IF EXISTS "pp_tenant_select" ON public."lease_renewal_offers";--> statement-breakpoint
CREATE POLICY "pp_tenant_select" ON public."lease_renewal_offers" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)));--> statement-breakpoint
DROP POLICY IF EXISTS "pp_lease_renewal_offers_insert" ON public."lease_renewal_offers";--> statement-breakpoint
CREATE POLICY "pp_lease_renewal_offers_insert" ON public."lease_renewal_offers" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)));--> statement-breakpoint
DROP POLICY IF EXISTS "pp_lease_renewal_offers_update" ON public."lease_renewal_offers";--> statement-breakpoint
CREATE POLICY "pp_lease_renewal_offers_update" ON public."lease_renewal_offers" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)))
  WITH CHECK (pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)));--> statement-breakpoint
DROP POLICY IF EXISTS "pp_lease_renewal_offers_delete" ON public."lease_renewal_offers";--> statement-breakpoint
CREATE POLICY "pp_lease_renewal_offers_delete" ON public."lease_renewal_offers" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)));--> statement-breakpoint
-- Data API lockdown, the 0077/0085 posture: the anon key ships in the browser.
REVOKE ALL ON TABLE public.lease_renewal_offers FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE public.lease_renewal_offers_id_seq FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lease_renewal_offers TO service_role;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE public.lease_renewal_offers_id_seq TO service_role;--> statement-breakpoint

-- ── Backfill: one primary lease_residents row per existing lease ───────────
-- Idempotent (NOT EXISTS), so a re-run after a partial failure is safe.
-- Includes soft-deleted leases so history stays complete. Deposits are NOT
-- back-filled: the UI shows "Deposit not recorded" until one is entered.
INSERT INTO lease_residents (community_id, lease_id, user_id, is_primary, added_on)
SELECT l.community_id, l.id, l.resident_id, true, l.start_date
  FROM leases l
 WHERE l.resident_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM lease_residents lr WHERE lr.lease_id = l.id AND lr.user_id = l.resident_id
   );
