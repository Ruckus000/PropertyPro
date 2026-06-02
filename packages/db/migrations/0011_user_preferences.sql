CREATE TABLE "user_preferences" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"preference_key" text NOT NULL,
	"value" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_key_unique" UNIQUE("user_id","preference_key")
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- user_preferences is NOT tenant-scoped (no community_id). It is keyed by the
-- authenticated user; RLS restricts every row to its owner via auth.uid().
ALTER TABLE "user_preferences" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "user_preferences_select_own" ON public."user_preferences" AS PERMISSIVE FOR SELECT TO public USING ("user_id" = auth.uid());
--> statement-breakpoint
CREATE POLICY "user_preferences_insert_own" ON public."user_preferences" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("user_id" = auth.uid());
--> statement-breakpoint
CREATE POLICY "user_preferences_update_own" ON public."user_preferences" AS PERMISSIVE FOR UPDATE TO public USING ("user_id" = auth.uid()) WITH CHECK ("user_id" = auth.uid());
--> statement-breakpoint
CREATE POLICY "user_preferences_delete_own" ON public."user_preferences" AS PERMISSIVE FOR DELETE TO public USING ("user_id" = auth.uid());
