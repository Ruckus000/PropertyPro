ALTER TYPE "public"."maintenance_status" ADD VALUE 'submitted' BEFORE 'in_progress';--> statement-breakpoint
ALTER TYPE "public"."maintenance_status" ADD VALUE 'acknowledged' BEFORE 'in_progress';