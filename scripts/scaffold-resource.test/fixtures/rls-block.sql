-- RLS block template for a new tenant-scoped table.
--
-- `pnpm new:resource widgets` PRINTS this with names substituted; it does not
-- write a migration. Generate the migration with `db:generate` (which writes the
-- .sql, the journal entry AND the snapshot together), then append the policies
-- and trigger below — drizzle emits the CREATE TABLE and FK, but never RLS.
--
-- Replace the column list, RLS policies, and trigger as your resource needs.
-- The shape below is the project's canonical tenant-scoped table template:
--   - id bigserial PK
--   - community_id bigint FK → communities(id) ON DELETE CASCADE
--   - deleted_at for soft-delete (`.claude/rules/tenant-isolation.md`)
--   - ENABLE + FORCE row-level security (no service-role bypass)
--   - 4 baseline RLS policies (SELECT for any community member; INSERT/UPDATE/
--     DELETE restricted to privileged roles — board / cam / pm_admin)
--   - pp_rls_enforce_tenant_scope write-scope trigger
--
-- The helper SQL functions (`pp_rls_can_access_community`, `pp_rls_is_privileged`,
-- `pp_rls_can_read_audit_log`, `pp_rls_enforce_tenant_community_id`) are defined
-- in the baseline migration 0000_nappy_guardian.sql.

CREATE TABLE "widgets" (
    "id" bigserial PRIMARY KEY NOT NULL,
    "community_id" bigint NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "widgets" ADD CONSTRAINT "widgets_community_id_communities_id_fk"
    FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."widgets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."widgets" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "pp_tenant_select" ON public."widgets" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
--> statement-breakpoint
CREATE POLICY "pp_widgets_insert" ON public."widgets" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id))));
--> statement-breakpoint
CREATE POLICY "pp_widgets_update" ON public."widgets" AS PERMISSIVE FOR UPDATE TO public
  USING ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id))))
  WITH CHECK ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id))));
--> statement-breakpoint
CREATE POLICY "pp_widgets_delete" ON public."widgets" AS PERMISSIVE FOR DELETE TO public
  USING ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id))));
--> statement-breakpoint
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."widgets";
--> statement-breakpoint
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.widgets FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
