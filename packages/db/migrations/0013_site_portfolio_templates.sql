CREATE TABLE "site_portfolio_templates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"branding" jsonb DEFAULT '{}' NOT NULL,
	"site_logo_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "site_portfolio_templates" ADD CONSTRAINT "site_portfolio_templates_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- site_portfolio_templates is NOT tenant-scoped (no community_id). It is keyed
-- by the owning PM user; RLS restricts every row to its owner via auth.uid().
ALTER TABLE "site_portfolio_templates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "site_portfolio_templates_select_own" ON public."site_portfolio_templates" AS PERMISSIVE FOR SELECT TO public USING ("owner_user_id" = auth.uid());
--> statement-breakpoint
CREATE POLICY "site_portfolio_templates_insert_own" ON public."site_portfolio_templates" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("owner_user_id" = auth.uid());
--> statement-breakpoint
CREATE POLICY "site_portfolio_templates_update_own" ON public."site_portfolio_templates" AS PERMISSIVE FOR UPDATE TO public USING ("owner_user_id" = auth.uid()) WITH CHECK ("owner_user_id" = auth.uid());
--> statement-breakpoint
CREATE POLICY "site_portfolio_templates_delete_own" ON public."site_portfolio_templates" AS PERMISSIVE FOR DELETE TO public USING ("owner_user_id" = auth.uid());