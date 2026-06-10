ALTER TABLE "user_roles" ADD COLUMN "designation" text;--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_one_root_per_community" ON "user_roles" USING btree ("community_id") WHERE role = 'root_manager';--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_one_board_president_per_community" ON "user_roles" USING btree ("community_id") WHERE designation = 'board_president';--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_designation_check" CHECK (designation IS NULL OR designation IN ('board_president', 'board_member'));
