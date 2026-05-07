CREATE TABLE "onboarding_wizard_state" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"wizard_type" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"last_completed_step" integer,
	"step_data" jsonb DEFAULT '{}' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "logo_path" text;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "bedrooms" integer;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "bathrooms" integer;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "sqft" integer;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "rent_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "onboarding_wizard_state" ADD CONSTRAINT "onboarding_wizard_state_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_wizard_state_community_type_unique" ON "onboarding_wizard_state" USING btree ("community_id","wizard_type");