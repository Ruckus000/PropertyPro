ALTER TABLE "provisioning_jobs" DROP CONSTRAINT "provisioning_jobs_community_id_communities_id_fk";
--> statement-breakpoint
DROP INDEX "pending_signups_candidate_slug_unique";--> statement-breakpoint
ALTER TABLE "provisioning_jobs" ADD CONSTRAINT "provisioning_jobs_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pending_signups_candidate_slug_active_unique" ON "pending_signups" USING btree ("candidate_slug") WHERE "pending_signups"."status" NOT IN ('expired', 'completed');