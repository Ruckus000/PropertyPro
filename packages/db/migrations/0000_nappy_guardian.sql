CREATE TYPE "public"."support_access_level" AS ENUM('read_only', 'read_write');--> statement-breakpoint
CREATE TYPE "public"."community_type" AS ENUM('condo_718', 'hoa_720', 'apartment');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('draft', 'active', 'expired', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."document_source_type" AS ENUM('library', 'violation_evidence', 'authored');--> statement-breakpoint
CREATE TYPE "public"."email_frequency" AS ENUM('immediate', 'daily_digest', 'weekly_digest', 'never');--> statement-breakpoint
CREATE TYPE "public"."extraction_status" AS ENUM('pending', 'completed', 'failed', 'not_applicable', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."lease_status" AS ENUM('active', 'expired', 'renewed', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."maintenance_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."maintenance_status" AS ENUM('open', 'submitted', 'acknowledged', 'in_progress', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."platform_admin_role" AS ENUM('super_admin');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'tenant', 'board_member', 'board_president', 'cam', 'site_manager', 'property_manager_admin');--> statement-breakpoint
CREATE TYPE "public"."user_role_v2" AS ENUM('resident', 'manager', 'pm_admin');--> statement-breakpoint
CREATE TABLE "access_plans" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"grace_ends_at" timestamp with time zone NOT NULL,
	"duration_months" integer NOT NULL,
	"grace_period_days" integer DEFAULT 30 NOT NULL,
	"stripe_coupon_id" text,
	"granted_by" uuid NOT NULL,
	"notes" text,
	"converted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"email_14d_sent_at" timestamp with time zone,
	"email_7d_sent_at" timestamp with time zone,
	"email_expired_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_deletion_requests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"request_type" text NOT NULL,
	"user_id" uuid NOT NULL,
	"community_id" bigint,
	"status" text NOT NULL,
	"cooling_ends_at" timestamp with time zone NOT NULL,
	"scheduled_purge_at" timestamp with time zone,
	"purged_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"recovered_at" timestamp with time zone,
	"platform_admin_notified_at" timestamp with time zone,
	"intervention_notes" text,
	"confirmation_email_sent_at" timestamp with time zone,
	"execution_email_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_access_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"community_id" bigint NOT NULL,
	"session_id" bigint,
	"event" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "support_consent_grants" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"granted_by" uuid NOT NULL,
	"access_level" text DEFAULT 'read_only' NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "support_sessions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"target_user_id" uuid NOT NULL,
	"community_id" bigint NOT NULL,
	"reason" text NOT NULL,
	"ticket_id" text,
	"access_level" "support_access_level" DEFAULT 'read_only' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_reason" text,
	"consent_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_requests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"email" varchar(255) NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"phone" varchar(50),
	"unit_id" bigint,
	"claimed_unit_number" varchar(100),
	"role_requested" varchar(20) DEFAULT 'resident' NOT NULL,
	"is_unit_owner" boolean DEFAULT false NOT NULL,
	"status" varchar(20) DEFAULT 'pending_verification' NOT NULL,
	"otp_hash" varchar(255),
	"otp_expires_at" timestamp with time zone,
	"otp_attempts" integer DEFAULT 0 NOT NULL,
	"email_verified_at" timestamp with time zone,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"denial_reason" text,
	"ref_code" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "community_join_requests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"community_id" bigint NOT NULL,
	"unit_identifier" text NOT NULL,
	"resident_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "communities" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"community_type" "community_type" NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"state" text,
	"zip_code" text,
	"logo_path" text,
	"branding" jsonb,
	"community_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"billing_group_id" bigint,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"subscription_plan" text,
	"subscription_status" text,
	"payment_failed_at" timestamp with time zone,
	"next_reminder_at" timestamp with time zone,
	"subscription_canceled_at" timestamp with time zone,
	"cancellation_reason" text,
	"cancellation_note" text,
	"cancellation_captured_at" timestamp with time zone,
	"free_access_expires_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"demo_expires_at" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"custom_domain" text,
	"site_published_at" timestamp with time zone,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"transparency_enabled" boolean DEFAULT false NOT NULL,
	"transparency_acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "communities_slug_unique" UNIQUE("slug"),
	CONSTRAINT "communities_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"phone_verified_at" timestamp with time zone,
	"avatar_url" text,
	"otp_last_sent_at" timestamp with time zone,
	"otp_failed_attempts" integer DEFAULT 0 NOT NULL,
	"otp_locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"community_id" bigint NOT NULL,
	"role" "user_role_v2" NOT NULL,
	"unit_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_unit_owner" boolean DEFAULT false NOT NULL,
	"permissions" jsonb,
	"preset_key" text,
	"display_title" text,
	"legacy_role" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_community_unique" UNIQUE("user_id","community_id")
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"unit_number" text NOT NULL,
	"building" text,
	"floor" integer,
	"owner_user_id" uuid,
	"bedrooms" integer,
	"bathrooms" integer,
	"sqft" integer,
	"rent_amount" numeric(10, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "document_categories" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"category_id" bigint,
	"title" text NOT NULL,
	"description" text,
	"file_path" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" bigint NOT NULL,
	"mime_type" text NOT NULL,
	"source_type" "document_source_type" DEFAULT 'library' NOT NULL,
	"parent_document_id" bigint,
	"uploaded_by" uuid,
	"search_text" text,
	"search_vector" "tsvector",
	"extraction_status" "extraction_status" DEFAULT 'not_applicable' NOT NULL,
	"extraction_error" text,
	"extracted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "document_drafts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"author_id" uuid NOT NULL,
	"title" text DEFAULT 'Untitled' NOT NULL,
	"body_html" text DEFAULT '' NOT NULL,
	"target_category_id" bigint,
	"target_meeting_id" bigint,
	"source_document_id" bigint,
	"cover_sheet_enabled" boolean DEFAULT false NOT NULL,
	"letterhead_options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_editor_id" uuid,
	"last_edited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"audience" text DEFAULT 'all' NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"published_by" uuid NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "announcement_delivery_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"announcement_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_message_id" text,
	"error_message" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"attempted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcement_delivery_log_unique" UNIQUE("announcement_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "calendar_event_reminder_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"event_kind" text NOT NULL,
	"event_key" text NOT NULL,
	"reminder_preset" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processing_started_at" timestamp with time zone,
	"last_attempted_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"provider_message_id" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_digest_queue" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"frequency" "email_frequency" NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"event_type" text NOT NULL,
	"event_title" text NOT NULL,
	"event_summary" text,
	"action_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processing_started_at" timestamp with time zone,
	"last_attempted_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"community_id" bigint NOT NULL,
	"email_frequency" text DEFAULT 'immediate' NOT NULL,
	"email_announcements" boolean DEFAULT true NOT NULL,
	"email_meetings" boolean DEFAULT true NOT NULL,
	"in_app_enabled" boolean DEFAULT true NOT NULL,
	"calendar_reminder_preset" text DEFAULT '7_days_before' NOT NULL,
	"calendar_reminder_meetings" boolean DEFAULT true NOT NULL,
	"calendar_reminder_personal_assessments" boolean DEFAULT true NOT NULL,
	"calendar_reminder_community_assessments" boolean DEFAULT false NOT NULL,
	"in_app_announcements" boolean DEFAULT true NOT NULL,
	"in_app_documents" boolean DEFAULT true NOT NULL,
	"in_app_meetings" boolean DEFAULT true NOT NULL,
	"in_app_maintenance" boolean DEFAULT true NOT NULL,
	"in_app_violations" boolean DEFAULT true NOT NULL,
	"in_app_elections" boolean DEFAULT true NOT NULL,
	"sms_enabled" boolean DEFAULT false NOT NULL,
	"sms_emergency_only" boolean DEFAULT true NOT NULL,
	"sms_consent_given_at" timestamp with time zone,
	"sms_consent_revoked_at" timestamp with time zone,
	"sms_consent_method" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_community_unique" UNIQUE("user_id","community_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"action_url" text,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"read_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pending_signups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"signup_request_id" text NOT NULL,
	"auth_user_id" uuid,
	"primary_contact_name" text NOT NULL,
	"email" text NOT NULL,
	"email_normalized" text NOT NULL,
	"community_name" text NOT NULL,
	"address" text NOT NULL,
	"address_line_1" text,
	"city" text,
	"state" text,
	"zip_code" text,
	"county" text NOT NULL,
	"unit_count" integer NOT NULL,
	"community_type" "community_type" NOT NULL,
	"plan_key" text NOT NULL,
	"candidate_slug" text NOT NULL,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"verification_email_sent_at" timestamp with time zone,
	"verification_email_id" text,
	"status" text DEFAULT 'pending_verification' NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "pending_signups_status_check" CHECK ("pending_signups"."status" IN ('pending_verification','email_verified','checkout_started','payment_completed','provisioning','completed','expired'))
);
--> statement-breakpoint
CREATE TABLE "platform_admin_users" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"role" "platform_admin_role" DEFAULT 'super_admin' NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_webhook_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"amount_cents" bigint NOT NULL,
	"frequency" text NOT NULL,
	"due_day" integer,
	"late_fee_amount_cents" bigint DEFAULT 0 NOT NULL,
	"late_fee_days_grace" integer DEFAULT 0 NOT NULL,
	"start_date" date DEFAULT CURRENT_DATE NOT NULL,
	"end_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "assessment_line_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"assessment_id" bigint,
	"community_id" bigint NOT NULL,
	"unit_id" bigint NOT NULL,
	"amount_cents" bigint NOT NULL,
	"due_date" date DEFAULT CURRENT_DATE NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"payment_intent_id" text,
	"late_fee_cents" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rent_obligations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"lease_id" bigint NOT NULL,
	"unit_id" bigint NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"due_date" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rent_payments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"lease_id" bigint NOT NULL,
	"obligation_id" bigint,
	"unit_id" bigint NOT NULL,
	"resident_id" uuid,
	"amount_cents" bigint NOT NULL,
	"payment_date" date DEFAULT CURRENT_DATE NOT NULL,
	"payment_method" text,
	"external_reference" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stripe_connected_accounts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"stripe_account_id" text NOT NULL,
	"onboarding_complete" boolean DEFAULT false NOT NULL,
	"charges_enabled" boolean DEFAULT false NOT NULL,
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "finance_stripe_webhook_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"stripe_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_sync_tokens" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"sync_token" text,
	"channel_id" text,
	"channel_expiry" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "accounting_connections" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"provider" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"tenant_id" text NOT NULL,
	"last_sync_at" timestamp with time zone,
	"mapping_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "violations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"unit_id" bigint NOT NULL,
	"reported_by_user_id" uuid,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'reported' NOT NULL,
	"severity" text DEFAULT 'minor' NOT NULL,
	"evidence_document_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notice_date" date,
	"hearing_date" timestamp with time zone,
	"resolution_date" timestamp with time zone,
	"resolution_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "violation_fines" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"violation_id" bigint NOT NULL,
	"amount_cents" bigint NOT NULL,
	"ledger_entry_id" bigint,
	"status" text DEFAULT 'pending' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"waived_at" timestamp with time zone,
	"waived_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "arc_submissions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"unit_id" bigint NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"project_type" text NOT NULL,
	"estimated_start_date" date,
	"estimated_completion_date" date,
	"attachment_document_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"review_notes" text,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "polls" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"poll_type" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ends_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "poll_votes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"poll_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"selected_options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forum_threads" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"author_user_id" uuid NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "forum_replies" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"thread_id" bigint NOT NULL,
	"body" text NOT NULL,
	"author_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"phone" text,
	"email" text,
	"specialties" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"unit_id" bigint,
	"vendor_id" bigint,
	"assigned_by_user_id" uuid,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"sla_response_hours" integer,
	"sla_completion_hours" integer,
	"assigned_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "amenities" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"location" text,
	"capacity" integer,
	"is_bookable" boolean DEFAULT true NOT NULL,
	"booking_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "amenity_reservations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"amenity_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"unit_id" bigint,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "package_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"unit_id" bigint NOT NULL,
	"recipient_name" text NOT NULL,
	"carrier" text NOT NULL,
	"tracking_number" text,
	"status" text DEFAULT 'received' NOT NULL,
	"received_by_staff_id" uuid,
	"picked_up_at" timestamp with time zone,
	"picked_up_by_name" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "visitor_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"visitor_name" text NOT NULL,
	"purpose" text NOT NULL,
	"host_unit_id" bigint NOT NULL,
	"host_user_id" uuid,
	"expected_arrival" timestamp with time zone NOT NULL,
	"checked_in_at" timestamp with time zone,
	"checked_out_at" timestamp with time zone,
	"pass_code" text NOT NULL,
	"staff_user_id" uuid,
	"notes" text,
	"guest_type" text DEFAULT 'one_time' NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"recurrence_rule" text,
	"expected_duration_minutes" integer,
	"vehicle_make" text,
	"vehicle_model" text,
	"vehicle_color" text,
	"vehicle_plate" text,
	"revoked_by_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "denied_visitors" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"full_name" text NOT NULL,
	"reason" text NOT NULL,
	"denied_by_user_id" uuid,
	"vehicle_plate" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "provisioning_jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint,
	"stripe_event_id" text,
	"signup_request_id" text,
	"status" text NOT NULL,
	"last_successful_status" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_message" text,
	"retry_count" integer DEFAULT 0,
	CONSTRAINT "provisioning_jobs_stripe_event_id_unique" UNIQUE("stripe_event_id"),
	CONSTRAINT "status_check" CHECK ("provisioning_jobs"."status" IN ('initiated','community_created','user_linked','checklist_generated','categories_created','preferences_set','email_sent','completed','failed')),
	CONSTRAINT "last_successful_status_check" CHECK ("provisioning_jobs"."last_successful_status" IS NULL OR "provisioning_jobs"."last_successful_status" IN ('community_created','user_linked','checklist_generated','categories_created','preferences_set','email_sent','completed'))
);
--> statement-breakpoint
CREATE TABLE "compliance_audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"community_id" bigint NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"old_values" jsonb,
	"new_values" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_checklist_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"template_key" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"statute_reference" text,
	"document_id" bigint,
	"document_posted_at" timestamp with time zone,
	"deadline" timestamp with time zone,
	"rolling_window" jsonb,
	"is_conditional" boolean DEFAULT false NOT NULL,
	"is_applicable" boolean DEFAULT true NOT NULL,
	"last_modified_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"invited_by" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"title" text NOT NULL,
	"meeting_type" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"location" text NOT NULL,
	"notice_posted_at" timestamp with time zone,
	"minutes_approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "meeting_documents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"meeting_id" bigint NOT NULL,
	"document_id" bigint NOT NULL,
	"attached_by" uuid,
	"attached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leases" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"unit_id" bigint NOT NULL,
	"resident_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"rent_amount" numeric(10, 2),
	"status" "lease_status" DEFAULT 'active' NOT NULL,
	"previous_lease_id" bigint,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "move_checklists" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"lease_id" bigint NOT NULL,
	"unit_id" bigint NOT NULL,
	"resident_id" uuid NOT NULL,
	"type" text NOT NULL,
	"checklist_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "maintenance_requests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"unit_id" bigint,
	"submitted_by_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" "maintenance_status" DEFAULT 'open' NOT NULL,
	"priority" "maintenance_priority" DEFAULT 'normal' NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"assigned_to_id" uuid,
	"internal_notes" text,
	"resolution_description" text,
	"resolution_date" timestamp with time zone,
	"photos" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "maintenance_comments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"request_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"text" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"title" text NOT NULL,
	"vendor_name" text NOT NULL,
	"description" text,
	"contract_value" numeric(12, 2),
	"start_date" date NOT NULL,
	"end_date" date,
	"document_id" bigint,
	"compliance_checklist_item_id" bigint,
	"bidding_closes_at" timestamp with time zone,
	"conflict_of_interest" boolean DEFAULT false NOT NULL,
	"conflict_of_interest_note" text,
	"status" "contract_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contract_bids" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"contract_id" bigint NOT NULL,
	"community_id" bigint NOT NULL,
	"vendor_name" text NOT NULL,
	"bid_amount" numeric(12, 2) NOT NULL,
	"notes" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"entry_type" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"description" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text,
	"unit_id" bigint,
	"user_id" uuid,
	"effective_date" date DEFAULT CURRENT_DATE NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"deleted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo_seed_registry" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"seed_key" text NOT NULL,
	"entity_id" text NOT NULL,
	"community_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demo_seed_registry_entity_seed_unique" UNIQUE("entity_type","seed_key")
);
--> statement-breakpoint
CREATE TABLE "demo_instances" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"template_type" "community_type" NOT NULL,
	"prospect_name" text NOT NULL,
	"slug" text NOT NULL,
	"theme" jsonb NOT NULL,
	"seeded_community_id" bigint,
	"demo_resident_user_id" uuid,
	"demo_board_user_id" uuid,
	"demo_resident_email" text NOT NULL,
	"demo_board_email" text NOT NULL,
	"auth_token_secret" text NOT NULL,
	"external_crm_url" text,
	"prospect_notes" text,
	"public_template_id" bigint,
	"public_template_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"customized_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "demo_instances_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
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
CREATE TABLE "onboarding_checklist_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "onboarding_checklist_community_user_key" UNIQUE("community_id","user_id","item_key")
);
--> statement-breakpoint
CREATE TABLE "site_blocks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"block_order" integer NOT NULL,
	"block_type" text NOT NULL,
	"content" jsonb DEFAULT '{}' NOT NULL,
	"is_draft" boolean DEFAULT true NOT NULL,
	"template_variant" text DEFAULT 'public' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "site_blocks_community_order_draft_variant_unique" UNIQUE("community_id","block_order","is_draft","template_variant")
);
--> statement-breakpoint
CREATE TABLE "esign_consent" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"consent_given" boolean DEFAULT true NOT NULL,
	"consent_text" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"given_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "esign_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"submission_id" bigint NOT NULL,
	"signer_id" bigint,
	"event_type" text NOT NULL,
	"event_data" jsonb,
	"ip_address" text,
	"user_agent" text,
	"webhook_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "esign_signers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"submission_id" bigint NOT NULL,
	"docuseal_submitter_id" integer,
	"external_id" text NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"name" text,
	"role" text NOT NULL,
	"slug" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"opened_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"signed_values" jsonb,
	"prefilled_fields" jsonb,
	"last_reminder_at" timestamp with time zone,
	"reminder_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "esign_signers_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "esign_submissions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"template_id" bigint NOT NULL,
	"docuseal_submission_id" integer,
	"external_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"send_email" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"signed_document_path" text,
	"audit_certificate_path" text,
	"linked_document_id" bigint,
	"message_subject" text,
	"signing_order" text DEFAULT 'parallel' NOT NULL,
	"document_hash" text,
	"message_body" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "esign_submissions_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "esign_templates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"docuseal_template_id" integer,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"source_document_path" text,
	"template_type" text,
	"fields_schema" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "esign_templates_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "emergency_broadcasts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"sms_body" text,
	"severity" text DEFAULT 'emergency' NOT NULL,
	"template_key" text,
	"target_audience" text DEFAULT 'all' NOT NULL,
	"channels" text DEFAULT 'sms,email' NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"delivered_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"initiated_by" uuid NOT NULL,
	"initiated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "emergency_broadcast_recipients" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"broadcast_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text,
	"phone" text,
	"sms_status" text DEFAULT 'pending' NOT NULL,
	"sms_provider_sid" text,
	"sms_error_code" text,
	"sms_error_message" text,
	"sms_sent_at" timestamp with time zone,
	"sms_delivered_at" timestamp with time zone,
	"email_status" text DEFAULT 'pending' NOT NULL,
	"email_provider_id" text,
	"email_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "emergency_broadcast_recipients_broadcast_user_unique" UNIQUE("broadcast_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "election_ballot_submissions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"election_id" bigint NOT NULL,
	"unit_id" bigint NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"submission_fingerprint" text NOT NULL,
	"voter_hash" text NOT NULL,
	"is_abstention" boolean DEFAULT false NOT NULL,
	"is_proxy_vote" boolean DEFAULT false NOT NULL,
	"proxy_id" bigint,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "election_ballots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"election_id" bigint NOT NULL,
	"submission_id" bigint NOT NULL,
	"candidate_id" bigint NOT NULL,
	"unit_id" bigint NOT NULL,
	"voter_hash" text NOT NULL,
	"is_abstention" boolean DEFAULT false NOT NULL,
	"is_proxy_vote" boolean DEFAULT false NOT NULL,
	"proxy_id" bigint,
	"cast_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "election_candidates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"election_id" bigint NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"user_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "election_eligibility_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"election_id" bigint NOT NULL,
	"unit_id" bigint NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"is_eligible" boolean DEFAULT true NOT NULL,
	"ineligibility_reason" text,
	"snapshot_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "election_proxies" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"election_id" bigint NOT NULL,
	"grantor_user_id" uuid NOT NULL,
	"grantor_unit_id" bigint NOT NULL,
	"proxy_holder_user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "elections" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"election_type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_secret_ballot" boolean DEFAULT true NOT NULL,
	"ballot_salt" text NOT NULL,
	"max_selections" integer DEFAULT 1 NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"quorum_percentage" integer DEFAULT 50 NOT NULL,
	"eligible_unit_count" integer DEFAULT 0 NOT NULL,
	"total_ballots_cast" integer DEFAULT 0 NOT NULL,
	"certified_by_user_id" uuid,
	"certified_at" timestamp with time zone,
	"results_document_id" bigint,
	"canceled_reason" text,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "elections_closes_after_opens" CHECK ("elections"."closes_at" > "elections"."opens_at"),
	CONSTRAINT "elections_quorum_range" CHECK ("elections"."quorum_percentage" >= 1 AND "elections"."quorum_percentage" <= 100),
	CONSTRAINT "elections_max_selections_positive" CHECK ("elections"."max_selections" >= 1)
);
--> statement-breakpoint
CREATE TABLE "faqs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"category" text,
	"role_visibility" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "help_article_feedback" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"article_slug" text NOT NULL,
	"article_category" text NOT NULL,
	"rating" smallint NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "help_article_views" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"article_slug" text NOT NULL,
	"article_category" text NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_prices" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"community_type" text NOT NULL,
	"billing_interval" text NOT NULL,
	"stripe_price_id" text NOT NULL,
	"unit_amount_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_prices_stripe_price_id_unique" UNIQUE("stripe_price_id"),
	CONSTRAINT "stripe_prices_plan_community_interval" UNIQUE("plan_id","community_type","billing_interval")
);
--> statement-breakpoint
CREATE TABLE "conversion_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"demo_id" bigint,
	"community_id" bigint,
	"event_type" text NOT NULL,
	"source" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"stripe_event_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "conversion_events_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "public_site_templates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"community_type" "community_type" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"thumbnail_descriptor" jsonb NOT NULL,
	"draft_jsx_source" text NOT NULL,
	"published_snapshot" jsonb,
	"version" integer DEFAULT 0 NOT NULL,
	"published_payload_hash" text,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "public_site_templates_slug_unique" UNIQUE("slug"),
	CONSTRAINT "public_site_templates_type_sort_unique" UNIQUE("community_type","sort_order")
);
--> statement-breakpoint
CREATE TABLE "billing_groups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"volume_tier" text DEFAULT 'none' NOT NULL,
	"active_community_count" integer DEFAULT 0 NOT NULL,
	"coupon_sync_status" text DEFAULT 'synced' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "billing_groups_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "billing_groups_volume_tier_check" CHECK ("billing_groups"."volume_tier" IN ('none', 'tier_10', 'tier_15', 'tier_20')),
	CONSTRAINT "billing_groups_coupon_sync_status_check" CHECK ("billing_groups"."coupon_sync_status" IN ('synced', 'pending', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "revenue_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"snapshot_date" date NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mrr_cents" bigint NOT NULL,
	"potential_mrr_cents" bigint NOT NULL,
	"active_subscriptions" integer NOT NULL,
	"trialing_subscriptions" integer NOT NULL,
	"past_due_subscriptions" integer NOT NULL,
	"by_plan" jsonb NOT NULL,
	"by_community_type" jsonb NOT NULL,
	"volume_discount_savings_cents" bigint DEFAULT 0 NOT NULL,
	"free_access_cost_cents" bigint DEFAULT 0 NOT NULL,
	"prices_version" text NOT NULL,
	"reconciliation_drift_pct" numeric(5, 2),
	"communities_skipped" integer DEFAULT 0 NOT NULL,
	"mrr_delta_pct" numeric(6, 2)
);
--> statement-breakpoint
ALTER TABLE "access_plans" ADD CONSTRAINT "access_plans_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_plans" ADD CONSTRAINT "access_plans_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_plans" ADD CONSTRAINT "access_plans_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_access_log" ADD CONSTRAINT "support_access_log_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_consent_grants" ADD CONSTRAINT "support_consent_grants_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_join_requests" ADD CONSTRAINT "community_join_requests_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_billing_group_id_billing_groups_id_fk" FOREIGN KEY ("billing_group_id") REFERENCES "public"."billing_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_categories" ADD CONSTRAINT "document_categories_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_category_id_document_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."document_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_drafts" ADD CONSTRAINT "document_drafts_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_drafts" ADD CONSTRAINT "document_drafts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_drafts" ADD CONSTRAINT "document_drafts_target_category_id_document_categories_id_fk" FOREIGN KEY ("target_category_id") REFERENCES "public"."document_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_drafts" ADD CONSTRAINT "document_drafts_target_meeting_id_meetings_id_fk" FOREIGN KEY ("target_meeting_id") REFERENCES "public"."meetings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_drafts" ADD CONSTRAINT "document_drafts_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_drafts" ADD CONSTRAINT "document_drafts_last_editor_id_users_id_fk" FOREIGN KEY ("last_editor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_delivery_log" ADD CONSTRAINT "announcement_delivery_log_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_delivery_log" ADD CONSTRAINT "announcement_delivery_log_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_delivery_log" ADD CONSTRAINT "announcement_delivery_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_reminder_log" ADD CONSTRAINT "calendar_event_reminder_log_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_reminder_log" ADD CONSTRAINT "calendar_event_reminder_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_digest_queue" ADD CONSTRAINT "notification_digest_queue_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_digest_queue" ADD CONSTRAINT "notification_digest_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_line_items" ADD CONSTRAINT "assessment_line_items_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_line_items" ADD CONSTRAINT "assessment_line_items_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_line_items" ADD CONSTRAINT "assessment_line_items_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_obligations" ADD CONSTRAINT "rent_obligations_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_obligations" ADD CONSTRAINT "rent_obligations_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_obligations" ADD CONSTRAINT "rent_obligations_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_obligation_id_rent_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."rent_obligations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_resident_id_users_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_connected_accounts" ADD CONSTRAINT "stripe_connected_accounts_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_stripe_webhook_events" ADD CONSTRAINT "finance_stripe_webhook_events_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_sync_tokens" ADD CONSTRAINT "calendar_sync_tokens_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_sync_tokens" ADD CONSTRAINT "calendar_sync_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_connections" ADD CONSTRAINT "accounting_connections_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violations" ADD CONSTRAINT "violations_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violations" ADD CONSTRAINT "violations_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violations" ADD CONSTRAINT "violations_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violation_fines" ADD CONSTRAINT "violation_fines_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violation_fines" ADD CONSTRAINT "violation_fines_violation_id_violations_id_fk" FOREIGN KEY ("violation_id") REFERENCES "public"."violations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violation_fines" ADD CONSTRAINT "violation_fines_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violation_fines" ADD CONSTRAINT "violation_fines_waived_by_user_id_users_id_fk" FOREIGN KEY ("waived_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arc_submissions" ADD CONSTRAINT "arc_submissions_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arc_submissions" ADD CONSTRAINT "arc_submissions_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arc_submissions" ADD CONSTRAINT "arc_submissions_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arc_submissions" ADD CONSTRAINT "arc_submissions_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_threads" ADD CONSTRAINT "forum_threads_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_threads" ADD CONSTRAINT "forum_threads_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_replies" ADD CONSTRAINT "forum_replies_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_replies" ADD CONSTRAINT "forum_replies_thread_id_forum_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."forum_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_replies" ADD CONSTRAINT "forum_replies_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amenities" ADD CONSTRAINT "amenities_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amenity_reservations" ADD CONSTRAINT "amenity_reservations_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amenity_reservations" ADD CONSTRAINT "amenity_reservations_amenity_id_amenities_id_fk" FOREIGN KEY ("amenity_id") REFERENCES "public"."amenities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amenity_reservations" ADD CONSTRAINT "amenity_reservations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amenity_reservations" ADD CONSTRAINT "amenity_reservations_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_log" ADD CONSTRAINT "package_log_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_log" ADD CONSTRAINT "package_log_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_log" ADD CONSTRAINT "package_log_received_by_staff_id_users_id_fk" FOREIGN KEY ("received_by_staff_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_log" ADD CONSTRAINT "visitor_log_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_log" ADD CONSTRAINT "visitor_log_host_unit_id_units_id_fk" FOREIGN KEY ("host_unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_log" ADD CONSTRAINT "visitor_log_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_log" ADD CONSTRAINT "visitor_log_staff_user_id_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_log" ADD CONSTRAINT "visitor_log_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denied_visitors" ADD CONSTRAINT "denied_visitors_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denied_visitors" ADD CONSTRAINT "denied_visitors_denied_by_user_id_users_id_fk" FOREIGN KEY ("denied_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioning_jobs" ADD CONSTRAINT "provisioning_jobs_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Unique index on pending_signups.signup_request_id must exist before the FK below references it.
-- Moved up from the autogen index block so a fresh-bootstrap migrate doesn't fail on the FK.
CREATE UNIQUE INDEX "pending_signups_signup_request_unique" ON "pending_signups" USING btree ("signup_request_id");--> statement-breakpoint
ALTER TABLE "provisioning_jobs" ADD CONSTRAINT "provisioning_jobs_signup_request_id_pending_signups_signup_request_id_fk" FOREIGN KEY ("signup_request_id") REFERENCES "public"."pending_signups"("signup_request_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_audit_log" ADD CONSTRAINT "compliance_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_audit_log" ADD CONSTRAINT "compliance_audit_log_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_checklist_items" ADD CONSTRAINT "compliance_checklist_items_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_checklist_items" ADD CONSTRAINT "compliance_checklist_items_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_documents" ADD CONSTRAINT "meeting_documents_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_documents" ADD CONSTRAINT "meeting_documents_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_documents" ADD CONSTRAINT "meeting_documents_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_resident_id_users_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_previous_lease_id_fk" FOREIGN KEY ("previous_lease_id") REFERENCES "public"."leases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_checklists" ADD CONSTRAINT "move_checklists_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_checklists" ADD CONSTRAINT "move_checklists_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_checklists" ADD CONSTRAINT "move_checklists_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_checklists" ADD CONSTRAINT "move_checklists_resident_id_users_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_checklists" ADD CONSTRAINT "move_checklists_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_comments" ADD CONSTRAINT "maintenance_comments_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_comments" ADD CONSTRAINT "maintenance_comments_request_id_maintenance_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."maintenance_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_comments" ADD CONSTRAINT "maintenance_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_compliance_checklist_item_id_compliance_checklist_items_id_fk" FOREIGN KEY ("compliance_checklist_item_id") REFERENCES "public"."compliance_checklist_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_bids" ADD CONSTRAINT "contract_bids_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_bids" ADD CONSTRAINT "contract_bids_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_bids" ADD CONSTRAINT "contract_bids_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_seed_registry" ADD CONSTRAINT "demo_seed_registry_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_instances" ADD CONSTRAINT "demo_instances_seeded_community_id_communities_id_fk" FOREIGN KEY ("seeded_community_id") REFERENCES "public"."communities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_instances" ADD CONSTRAINT "demo_instances_public_template_id_public_site_templates_id_fk" FOREIGN KEY ("public_template_id") REFERENCES "public"."public_site_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_wizard_state" ADD CONSTRAINT "onboarding_wizard_state_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_checklist_items" ADD CONSTRAINT "onboarding_checklist_items_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_checklist_items" ADD CONSTRAINT "onboarding_checklist_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_blocks" ADD CONSTRAINT "site_blocks_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esign_consent" ADD CONSTRAINT "esign_consent_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esign_consent" ADD CONSTRAINT "esign_consent_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esign_events" ADD CONSTRAINT "esign_events_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esign_events" ADD CONSTRAINT "esign_events_submission_id_esign_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."esign_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esign_events" ADD CONSTRAINT "esign_events_signer_id_esign_signers_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."esign_signers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esign_signers" ADD CONSTRAINT "esign_signers_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esign_signers" ADD CONSTRAINT "esign_signers_submission_id_esign_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."esign_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esign_signers" ADD CONSTRAINT "esign_signers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esign_submissions" ADD CONSTRAINT "esign_submissions_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esign_submissions" ADD CONSTRAINT "esign_submissions_template_id_esign_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."esign_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esign_submissions" ADD CONSTRAINT "esign_submissions_linked_document_id_documents_id_fk" FOREIGN KEY ("linked_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esign_submissions" ADD CONSTRAINT "esign_submissions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esign_templates" ADD CONSTRAINT "esign_templates_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esign_templates" ADD CONSTRAINT "esign_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_broadcasts" ADD CONSTRAINT "emergency_broadcasts_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_broadcasts" ADD CONSTRAINT "emergency_broadcasts_initiated_by_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_broadcast_recipients" ADD CONSTRAINT "emergency_broadcast_recipients_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_broadcast_recipients" ADD CONSTRAINT "emergency_broadcast_recipients_broadcast_id_emergency_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."emergency_broadcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_broadcast_recipients" ADD CONSTRAINT "emergency_broadcast_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_ballot_submissions" ADD CONSTRAINT "election_ballot_submissions_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_ballot_submissions" ADD CONSTRAINT "election_ballot_submissions_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_ballot_submissions" ADD CONSTRAINT "election_ballot_submissions_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_ballot_submissions" ADD CONSTRAINT "election_ballot_submissions_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_ballot_submissions" ADD CONSTRAINT "election_ballot_submissions_proxy_id_election_proxies_id_fk" FOREIGN KEY ("proxy_id") REFERENCES "public"."election_proxies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_ballots" ADD CONSTRAINT "election_ballots_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_ballots" ADD CONSTRAINT "election_ballots_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_ballots" ADD CONSTRAINT "election_ballots_submission_id_election_ballot_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."election_ballot_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_ballots" ADD CONSTRAINT "election_ballots_candidate_id_election_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."election_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_ballots" ADD CONSTRAINT "election_ballots_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_candidates" ADD CONSTRAINT "election_candidates_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_candidates" ADD CONSTRAINT "election_candidates_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_candidates" ADD CONSTRAINT "election_candidates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_eligibility_snapshots" ADD CONSTRAINT "election_eligibility_snapshots_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_eligibility_snapshots" ADD CONSTRAINT "election_eligibility_snapshots_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_eligibility_snapshots" ADD CONSTRAINT "election_eligibility_snapshots_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_eligibility_snapshots" ADD CONSTRAINT "election_eligibility_snapshots_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_proxies" ADD CONSTRAINT "election_proxies_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_proxies" ADD CONSTRAINT "election_proxies_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_proxies" ADD CONSTRAINT "election_proxies_grantor_user_id_users_id_fk" FOREIGN KEY ("grantor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_proxies" ADD CONSTRAINT "election_proxies_grantor_unit_id_units_id_fk" FOREIGN KEY ("grantor_unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_proxies" ADD CONSTRAINT "election_proxies_proxy_holder_user_id_users_id_fk" FOREIGN KEY ("proxy_holder_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_proxies" ADD CONSTRAINT "election_proxies_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elections" ADD CONSTRAINT "elections_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elections" ADD CONSTRAINT "elections_certified_by_user_id_users_id_fk" FOREIGN KEY ("certified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elections" ADD CONSTRAINT "elections_results_document_id_documents_id_fk" FOREIGN KEY ("results_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elections" ADD CONSTRAINT "elections_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_article_feedback" ADD CONSTRAINT "help_article_feedback_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_article_feedback" ADD CONSTRAINT "help_article_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_article_views" ADD CONSTRAINT "help_article_views_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_article_views" ADD CONSTRAINT "help_article_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_demo_id_demo_instances_id_fk" FOREIGN KEY ("demo_id") REFERENCES "public"."demo_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_site_templates" ADD CONSTRAINT "public_site_templates_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_join_requests_community_status_base" ON "community_join_requests" USING btree ("community_id","status");--> statement-breakpoint
CREATE INDEX "idx_join_requests_user_base" ON "community_join_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_documents_search_vector" ON "documents" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "idx_documents_parent_document_id" ON "documents" USING btree ("parent_document_id");--> statement-breakpoint
CREATE INDEX "idx_document_drafts_community" ON "document_drafts" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "idx_document_drafts_author" ON "document_drafts" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "idx_document_drafts_meeting" ON "document_drafts" USING btree ("target_meeting_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_event_reminder_log_unique" ON "calendar_event_reminder_log" USING btree ("community_id","user_id","event_kind","event_key","reminder_preset");--> statement-breakpoint
CREATE INDEX "calendar_event_reminder_log_due_scan_idx" ON "calendar_event_reminder_log" USING btree ("status","next_attempt_at","community_id","created_at");--> statement-breakpoint
CREATE INDEX "calendar_event_reminder_log_user_scan_idx" ON "calendar_event_reminder_log" USING btree ("community_id","user_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_digest_queue_unique_idempotency" ON "notification_digest_queue" USING btree ("community_id","user_id","frequency","source_type","source_id");--> statement-breakpoint
CREATE INDEX "notification_digest_queue_due_scan_idx" ON "notification_digest_queue" USING btree ("status","next_attempt_at","frequency","community_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_digest_queue_rollup_idx" ON "notification_digest_queue" USING btree ("community_id","user_id","frequency","status","created_at");--> statement-breakpoint
CREATE INDEX "notifications_feed_idx" ON "notifications" USING btree ("community_id","user_id","archived_at","deleted_at","created_at");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("community_id","user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedup_unique" ON "notifications" USING btree ("community_id","user_id","source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pending_signups_email_normalized_unique" ON "pending_signups" USING btree ("email_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "pending_signups_candidate_slug_active_unique" ON "pending_signups" USING btree ("candidate_slug") WHERE "pending_signups"."status" NOT IN ('pending_verification', 'expired', 'completed');--> statement-breakpoint
CREATE INDEX "pending_signups_status_idx" ON "pending_signups" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "pending_signups_auth_user_id_idx" ON "pending_signups" USING btree ("auth_user_id");--> statement-breakpoint
CREATE INDEX "stripe_webhook_events_received_at_idx" ON "stripe_webhook_events" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_connected_accounts_community_unique" ON "stripe_connected_accounts" USING btree ("community_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_connected_accounts_stripe_account_unique" ON "stripe_connected_accounts" USING btree ("stripe_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_stripe_webhook_events_event_id_unique" ON "finance_stripe_webhook_events" USING btree ("stripe_event_id");--> statement-breakpoint
CREATE INDEX "finance_stripe_webhook_events_community_processed_idx" ON "finance_stripe_webhook_events" USING btree ("community_id","processed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "poll_votes_unique_poll_user" ON "poll_votes" USING btree ("poll_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provisioning_jobs_signup_request_id_unique" ON "provisioning_jobs" USING btree ("signup_request_id");--> statement-breakpoint
CREATE INDEX "provisioning_jobs_community_status_idx" ON "provisioning_jobs" USING btree ("community_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "compliance_checklist_community_template_key_active" ON "compliance_checklist_items" USING btree ("community_id","template_key") WHERE "compliance_checklist_items"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_unique" ON "invitations" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_move_checklists_lease_type" ON "move_checklists" USING btree ("lease_id","type") WHERE "move_checklists"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_wizard_state_community_type_unique" ON "onboarding_wizard_state" USING btree ("community_id","wizard_type");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_esign_consent_active" ON "esign_consent" USING btree ("community_id","user_id") WHERE "esign_consent"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "idx_esign_events_community" ON "esign_events" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "idx_esign_events_submission" ON "esign_events" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "idx_esign_events_webhook" ON "esign_events" USING btree ("webhook_event_id");--> statement-breakpoint
CREATE INDEX "idx_esign_signers_community" ON "esign_signers" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "idx_esign_signers_submission" ON "esign_signers" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "idx_esign_signers_user" ON "esign_signers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_esign_signers_email" ON "esign_signers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_esign_submissions_community" ON "esign_submissions" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "idx_esign_submissions_status" ON "esign_submissions" USING btree ("community_id","status");--> statement-breakpoint
CREATE INDEX "idx_esign_templates_community" ON "esign_templates" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "idx_election_ballot_submissions_election" ON "election_ballot_submissions" USING btree ("election_id","submitted_at");--> statement-breakpoint
CREATE INDEX "idx_election_ballot_submissions_unit" ON "election_ballot_submissions" USING btree ("election_id","unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_election_ballot_submissions_unit" ON "election_ballot_submissions" USING btree ("election_id","unit_id");--> statement-breakpoint
CREATE INDEX "idx_election_ballots_election" ON "election_ballots" USING btree ("election_id");--> statement-breakpoint
CREATE INDEX "idx_election_ballots_unit" ON "election_ballots" USING btree ("election_id","unit_id");--> statement-breakpoint
CREATE INDEX "idx_election_ballots_submission" ON "election_ballots" USING btree ("submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_election_ballots_unit_candidate" ON "election_ballots" USING btree ("election_id","unit_id","candidate_id");--> statement-breakpoint
CREATE INDEX "idx_election_candidates_election" ON "election_candidates" USING btree ("election_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_election_eligibility_election" ON "election_eligibility_snapshots" USING btree ("election_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_election_eligibility_unit" ON "election_eligibility_snapshots" USING btree ("election_id","unit_id");--> statement-breakpoint
CREATE INDEX "idx_election_proxies_election" ON "election_proxies" USING btree ("election_id","status");--> statement-breakpoint
CREATE INDEX "idx_election_proxies_holder" ON "election_proxies" USING btree ("proxy_holder_user_id","election_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_election_proxies_grantor" ON "election_proxies" USING btree ("election_id","grantor_unit_id") WHERE "election_proxies"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_elections_community_status" ON "elections" USING btree ("community_id","status");--> statement-breakpoint
CREATE INDEX "idx_elections_community_dates" ON "elections" USING btree ("community_id","opens_at","closes_at");--> statement-breakpoint
CREATE INDEX "idx_ce_demo" ON "conversion_events" USING btree ("demo_id");--> statement-breakpoint
CREATE INDEX "idx_ce_community" ON "conversion_events" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "idx_ce_type_occurred" ON "conversion_events" USING btree ("event_type","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_billing_groups_owner" ON "billing_groups" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "idx_revenue_snapshots_date_computed" ON "revenue_snapshots" USING btree ("snapshot_date","computed_at");
-- ============================================================
-- RLS LAYER -- appended to baseline; not generated by drizzle-kit.
-- Authoritative source: production introspection 2026-05-06.
-- ============================================================

-- Helper functions (must precede policies that reference them)
CREATE OR REPLACE FUNCTION public.enforce_demo_timestamps()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.is_demo = true AND (NEW.trial_ends_at IS NULL OR NEW.demo_expires_at IS NULL) THEN
    RAISE EXCEPTION 'Demo communities must have both trial_ends_at and demo_expires_at';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pp_rls_effective_role()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    session_user
  )::text;
$function$;

CREATE OR REPLACE FUNCTION public.pp_rls_is_privileged()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT "public"."pp_rls_effective_role"() IN ('postgres', 'service_role', 'supabase_admin');
$function$;

CREATE OR REPLACE FUNCTION public.pp_rls_active_community_id()
 RETURNS bigint
 LANGUAGE sql
 STABLE
AS $function$
  SELECT NULLIF(current_setting('app.current_community_id', true), '')::bigint;
$function$;

CREATE OR REPLACE FUNCTION public.pp_rls_has_community_membership(target_community_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
  SELECT CASE
    WHEN "public"."pp_rls_is_privileged"() THEN true
    WHEN auth.uid() IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM "public"."user_roles" ur
      WHERE ur.user_id = auth.uid()
        AND ur.community_id = target_community_id
    )
  END;
$function$;

CREATE OR REPLACE FUNCTION public.pp_rls_can_access_community(target_community_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT "public"."pp_rls_has_community_membership"(target_community_id);
$function$;

CREATE OR REPLACE FUNCTION public.pp_rls_can_read_audit_log(target_community_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
  SELECT CASE
    WHEN "public"."pp_rls_is_privileged"() THEN true
    WHEN auth.uid() IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM "public"."user_roles" ur
      WHERE ur.user_id = auth.uid()
        AND ur.community_id = target_community_id
        AND ur.role IN ('manager', 'pm_admin')
    )
  END;
$function$;

CREATE OR REPLACE FUNCTION public.pp_rls_community_allows_member_writes(p_community_id bigint, p_setting_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT COALESCE(
    (
      SELECT (c.community_settings ->> p_setting_key) IS DISTINCT FROM 'admin_only'
      FROM "public"."communities" c
      WHERE c.id = p_community_id
    ),
    true
  );
$function$;

CREATE OR REPLACE FUNCTION public.pp_rls_enforce_tenant_community_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  active_community_id bigint;
BEGIN
  -- Privileged jobs and migrations may write across tenants intentionally.
  IF "public"."pp_rls_is_privileged"() THEN
    RETURN NEW;
  END IF;

  active_community_id := "public"."pp_rls_active_community_id"();
  IF active_community_id IS NULL THEN
    RAISE EXCEPTION 'Missing tenant DB session context: app.current_community_id'
      USING ERRCODE = '42501';
  END IF;

  NEW.community_id := active_community_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_compliance_audit_log_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'compliance_audit_log is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'check_violation';
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_support_access_log_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'support_access_log is append-only'
    USING ERRCODE = 'check_violation';
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pp_sync_unit_rent_amount_from_lease(target_unit_id bigint)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  active_rent NUMERIC(10, 2);
BEGIN
  SELECT l.rent_amount
  INTO active_rent
  FROM leases l
  WHERE l.unit_id = target_unit_id
    AND l.deleted_at IS NULL
    AND l.status = 'active'
    AND l.start_date <= CURRENT_DATE
    AND (l.end_date IS NULL OR l.end_date >= CURRENT_DATE)
  ORDER BY l.start_date DESC, l.id DESC
  LIMIT 1;

  UPDATE units
  SET rent_amount = active_rent,
      updated_at = NOW()
  WHERE id = target_unit_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pp_leases_sync_unit_rent_amount()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM pp_sync_unit_rent_amount_from_lease(OLD.unit_id);
    RETURN OLD;
  END IF;

  PERFORM pp_sync_unit_rent_amount_from_lease(NEW.unit_id);

  IF TG_OP = 'UPDATE' AND NEW.unit_id <> OLD.unit_id THEN
    PERFORM pp_sync_unit_rent_amount_from_lease(OLD.unit_id);
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pp_enforce_lease_renewal_continuity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  prev_lease leases%ROWTYPE;
BEGIN
  IF NEW.previous_lease_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO prev_lease
  FROM leases
  WHERE id = NEW.previous_lease_id;

  IF prev_lease.id IS NULL THEN
    RAISE EXCEPTION 'previous_lease_id % does not exist', NEW.previous_lease_id;
  END IF;

  IF prev_lease.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'previous_lease_id % points to deleted lease', NEW.previous_lease_id;
  END IF;

  IF prev_lease.community_id <> NEW.community_id OR prev_lease.unit_id <> NEW.unit_id THEN
    RAISE EXCEPTION 'renewal must reference prior lease in same community and unit';
  END IF;

  IF prev_lease.end_date IS NULL THEN
    RAISE EXCEPTION 'previous lease must have end_date for renewal continuity';
  END IF;

  IF NEW.start_date <> (prev_lease.end_date + 1) THEN
    RAISE EXCEPTION 'renewal lease start_date must be previous end_date + 1 day';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pp_block_direct_unit_rent_amount_write()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.rent_amount IS DISTINCT FROM OLD.rent_amount AND pg_trigger_depth() = 0 THEN
    RAISE EXCEPTION 'units.rent_amount is derived from leases.rent_amount; update the lease instead';
  END IF;

  RETURN NEW;
END;
$function$;

-- Enable + force RLS per table
ALTER TABLE IF EXISTS "public"."access_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."access_plans" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."access_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."access_requests" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."account_deletion_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."account_deletion_requests" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."accounting_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."accounting_connections" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."amenities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."amenities" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."amenity_reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."amenity_reservations" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."announcement_delivery_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."announcement_delivery_log" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."announcements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."announcements" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."arc_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."arc_submissions" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."assessment_line_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."assessment_line_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."assessments" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."billing_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."billing_groups" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."calendar_event_reminder_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."calendar_event_reminder_log" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."calendar_sync_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."calendar_sync_tokens" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."communities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."communities" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."community_join_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."community_join_requests" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."compliance_audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."compliance_audit_log" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."compliance_checklist_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."compliance_checklist_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."contract_bids" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."contract_bids" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."contracts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."contracts" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."conversion_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."conversion_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."demo_instances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."demo_seed_registry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."demo_seed_registry" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."denied_visitors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."denied_visitors" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."document_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."document_categories" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."document_drafts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."document_drafts" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."documents" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."election_ballot_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."election_ballot_submissions" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."election_ballots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."election_ballots" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."election_candidates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."election_candidates" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."election_eligibility_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."election_eligibility_snapshots" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."election_proxies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."election_proxies" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."elections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."elections" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."emergency_broadcast_recipients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."emergency_broadcast_recipients" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."emergency_broadcasts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."emergency_broadcasts" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."esign_consent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."esign_consent" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."esign_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."esign_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."esign_signers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."esign_signers" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."esign_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."esign_submissions" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."esign_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."esign_templates" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."faqs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."faqs" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."finance_stripe_webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."finance_stripe_webhook_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."forum_replies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."forum_replies" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."forum_threads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."forum_threads" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."help_article_feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."help_article_feedback" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."help_article_views" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."help_article_views" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."invitations" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."leases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."leases" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."ledger_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."ledger_entries" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."maintenance_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."maintenance_comments" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."maintenance_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."maintenance_requests" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."meeting_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."meeting_documents" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."meetings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."meetings" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."move_checklists" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."move_checklists" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."notification_digest_queue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."notification_digest_queue" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."notification_preferences" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."notifications" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."onboarding_checklist_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."onboarding_checklist_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."onboarding_wizard_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."onboarding_wizard_state" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."package_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."package_log" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."platform_admin_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."platform_admin_users" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."poll_votes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."poll_votes" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."polls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."polls" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."provisioning_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."provisioning_jobs" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."public_site_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."public_site_templates" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."rent_obligations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."rent_obligations" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."rent_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."rent_payments" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."revenue_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."revenue_snapshots" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."site_blocks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."site_blocks" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."stripe_connected_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."stripe_connected_accounts" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."stripe_prices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."stripe_prices" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."support_access_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."support_access_log" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."support_consent_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."support_consent_grants" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."support_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."support_sessions" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."units" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."user_roles" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."vendors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."vendors" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."violation_fines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."violation_fines" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."violations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."violations" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."visitor_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."visitor_log" FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."work_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."work_orders" FORCE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "access_requests_tenant_insert" ON public."access_requests" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((community_id = (current_setting('app.community_id'::text, true))::bigint));
CREATE POLICY "access_requests_tenant_select" ON public."access_requests" AS PERMISSIVE FOR SELECT TO public
  USING ((community_id = (current_setting('app.community_id'::text, true))::bigint));
CREATE POLICY "access_requests_tenant_update" ON public."access_requests" AS PERMISSIVE FOR UPDATE TO public
  USING ((community_id = (current_setting('app.community_id'::text, true))::bigint));
CREATE POLICY "pp_accounting_connections_delete" ON public."accounting_connections" AS PERMISSIVE FOR DELETE TO public
  USING ((pp_rls_can_access_community(community_id) AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))));
CREATE POLICY "pp_accounting_connections_insert" ON public."accounting_connections" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((pp_rls_can_access_community(community_id) AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))));
CREATE POLICY "pp_accounting_connections_update" ON public."accounting_connections" AS PERMISSIVE FOR UPDATE TO public
  USING ((pp_rls_can_access_community(community_id) AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))))
  WITH CHECK ((pp_rls_can_access_community(community_id) AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))));
CREATE POLICY "pp_tenant_select" ON public."accounting_connections" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_delete" ON public."amenities" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_insert" ON public."amenities" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_select" ON public."amenities" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_update" ON public."amenities" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_access_community(community_id))
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_delete" ON public."amenity_reservations" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_insert" ON public."amenity_reservations" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_select" ON public."amenity_reservations" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_update" ON public."amenity_reservations" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_access_community(community_id))
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_service_delete" ON public."announcement_delivery_log" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_is_privileged());
CREATE POLICY "pp_service_insert" ON public."announcement_delivery_log" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_is_privileged());
CREATE POLICY "pp_service_select" ON public."announcement_delivery_log" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_is_privileged());
CREATE POLICY "pp_service_update" ON public."announcement_delivery_log" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_is_privileged())
  WITH CHECK (pp_rls_is_privileged());
CREATE POLICY "pp_announcements_delete" ON public."announcements" AS PERMISSIVE FOR DELETE TO public
  USING ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR pp_rls_community_allows_member_writes(community_id, 'announcementsWriteLevel'::text)))));
CREATE POLICY "pp_announcements_insert" ON public."announcements" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR pp_rls_community_allows_member_writes(community_id, 'announcementsWriteLevel'::text)))));
CREATE POLICY "pp_announcements_update" ON public."announcements" AS PERMISSIVE FOR UPDATE TO public
  USING ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR pp_rls_community_allows_member_writes(community_id, 'announcementsWriteLevel'::text)))))
  WITH CHECK ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR pp_rls_community_allows_member_writes(community_id, 'announcementsWriteLevel'::text)))));
CREATE POLICY "pp_tenant_select" ON public."announcements" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_delete" ON public."arc_submissions" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_insert" ON public."arc_submissions" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_select" ON public."arc_submissions" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_update" ON public."arc_submissions" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_access_community(community_id))
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_assessment_line_items_delete" ON public."assessment_line_items" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_assessment_line_items_insert" ON public."assessment_line_items" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_assessment_line_items_update" ON public."assessment_line_items" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_read_audit_log(community_id))
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_tenant_select" ON public."assessment_line_items" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_assessments_delete" ON public."assessments" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_assessments_insert" ON public."assessments" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_assessments_update" ON public."assessments" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_read_audit_log(community_id))
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_tenant_select" ON public."assessments" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "billing_groups_owner_read" ON public."billing_groups" AS PERMISSIVE FOR SELECT TO public
  USING ((owner_user_id = auth.uid()));
CREATE POLICY "billing_groups_service_write" ON public."billing_groups" AS PERMISSIVE FOR ALL TO public
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "pp_service_delete" ON public."calendar_event_reminder_log" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_is_privileged());
CREATE POLICY "pp_service_insert" ON public."calendar_event_reminder_log" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_is_privileged());
CREATE POLICY "pp_service_select" ON public."calendar_event_reminder_log" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_is_privileged());
CREATE POLICY "pp_service_update" ON public."calendar_event_reminder_log" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_is_privileged())
  WITH CHECK (pp_rls_is_privileged());
CREATE POLICY "pp_calendar_sync_tokens_delete" ON public."calendar_sync_tokens" AS PERMISSIVE FOR DELETE TO public
  USING ((pp_rls_can_access_community(community_id) AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))));
CREATE POLICY "pp_calendar_sync_tokens_insert" ON public."calendar_sync_tokens" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((pp_rls_can_access_community(community_id) AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))));
CREATE POLICY "pp_calendar_sync_tokens_update" ON public."calendar_sync_tokens" AS PERMISSIVE FOR UPDATE TO public
  USING ((pp_rls_can_access_community(community_id) AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))))
  WITH CHECK ((pp_rls_can_access_community(community_id) AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))));
CREATE POLICY "pp_tenant_select" ON public."calendar_sync_tokens" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_communities_delete" ON public."communities" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_is_privileged());
CREATE POLICY "pp_communities_insert" ON public."communities" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_is_privileged());
CREATE POLICY "pp_communities_select" ON public."communities" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_has_community_membership(id));
CREATE POLICY "pp_communities_update" ON public."communities" AS PERMISSIVE FOR UPDATE TO public
  USING ((pp_rls_is_privileged() OR (pp_rls_has_community_membership(id) AND pp_rls_can_read_audit_log(id))))
  WITH CHECK ((pp_rls_is_privileged() OR (pp_rls_has_community_membership(id) AND pp_rls_can_read_audit_log(id))));
CREATE POLICY "community_join_requests_tenant_insert" ON public."community_join_requests" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((community_id = (current_setting('app.community_id'::text, true))::bigint));
CREATE POLICY "community_join_requests_tenant_select" ON public."community_join_requests" AS PERMISSIVE FOR SELECT TO public
  USING ((community_id = (current_setting('app.community_id'::text, true))::bigint));
CREATE POLICY "community_join_requests_tenant_update" ON public."community_join_requests" AS PERMISSIVE FOR UPDATE TO public
  USING ((community_id = (current_setting('app.community_id'::text, true))::bigint));
CREATE POLICY "pp_audit_insert" ON public."compliance_audit_log" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_is_privileged());
CREATE POLICY "pp_audit_select" ON public."compliance_audit_log" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_compliance_checklist_items_delete" ON public."compliance_checklist_items" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_compliance_checklist_items_insert" ON public."compliance_checklist_items" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_compliance_checklist_items_update" ON public."compliance_checklist_items" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_read_audit_log(community_id))
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_tenant_select" ON public."compliance_checklist_items" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_contract_bids_delete" ON public."contract_bids" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_contract_bids_insert" ON public."contract_bids" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_contract_bids_update" ON public."contract_bids" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_read_audit_log(community_id))
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_tenant_select" ON public."contract_bids" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_contracts_delete" ON public."contracts" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_contracts_insert" ON public."contracts" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_contracts_update" ON public."contracts" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_read_audit_log(community_id))
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_tenant_select" ON public."contracts" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_service_delete" ON public."demo_seed_registry" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_is_privileged());
CREATE POLICY "pp_service_insert" ON public."demo_seed_registry" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_is_privileged());
CREATE POLICY "pp_service_select" ON public."demo_seed_registry" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_is_privileged());
CREATE POLICY "pp_service_update" ON public."demo_seed_registry" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_is_privileged())
  WITH CHECK (pp_rls_is_privileged());
CREATE POLICY "denied_visitors_delete" ON public."denied_visitors" AS PERMISSIVE FOR DELETE TO public
  USING ((pp_rls_can_access_community(community_id) AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))));
CREATE POLICY "denied_visitors_insert" ON public."denied_visitors" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((pp_rls_can_access_community(community_id) AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))));
CREATE POLICY "denied_visitors_select" ON public."denied_visitors" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "denied_visitors_update" ON public."denied_visitors" AS PERMISSIVE FOR UPDATE TO public
  USING ((pp_rls_can_access_community(community_id) AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))))
  WITH CHECK ((pp_rls_can_access_community(community_id) AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))));
CREATE POLICY "pp_document_categories_delete" ON public."document_categories" AS PERMISSIVE FOR DELETE TO public
  USING ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR pp_rls_community_allows_member_writes(community_id, 'documentCategoriesWriteLevel'::text)))));
CREATE POLICY "pp_document_categories_insert" ON public."document_categories" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR pp_rls_community_allows_member_writes(community_id, 'documentCategoriesWriteLevel'::text)))));
CREATE POLICY "pp_document_categories_update" ON public."document_categories" AS PERMISSIVE FOR UPDATE TO public
  USING ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR pp_rls_community_allows_member_writes(community_id, 'documentCategoriesWriteLevel'::text)))))
  WITH CHECK ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR pp_rls_community_allows_member_writes(community_id, 'documentCategoriesWriteLevel'::text)))));
CREATE POLICY "pp_tenant_select" ON public."document_categories" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "document_drafts_community_delete" ON public."document_drafts" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "document_drafts_community_insert" ON public."document_drafts" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "document_drafts_community_read" ON public."document_drafts" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "document_drafts_community_update" ON public."document_drafts" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "document_drafts_service_bypass" ON public."document_drafts" AS PERMISSIVE FOR ALL TO public
  USING (pp_rls_is_privileged());
CREATE POLICY "pp_documents_delete" ON public."documents" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_documents_insert" ON public."documents" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_documents_update" ON public."documents" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_read_audit_log(community_id))
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_tenant_select" ON public."documents" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_election_ballot_submissions_insert" ON public."election_ballot_submissions" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_delete" ON public."election_ballot_submissions" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_select" ON public."election_ballot_submissions" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_update" ON public."election_ballot_submissions" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_access_community(community_id))
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_election_ballots_insert" ON public."election_ballots" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_select" ON public."election_ballots" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_election_candidates_admin_delete" ON public."election_candidates" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_election_candidates_admin_insert" ON public."election_candidates" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_election_candidates_admin_update" ON public."election_candidates" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_read_audit_log(community_id))
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_tenant_select" ON public."election_candidates" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_election_eligibility_insert" ON public."election_eligibility_snapshots" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_select" ON public."election_eligibility_snapshots" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_delete" ON public."election_proxies" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_insert" ON public."election_proxies" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_select" ON public."election_proxies" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_update" ON public."election_proxies" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_access_community(community_id))
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_elections_admin_delete" ON public."elections" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_elections_admin_insert" ON public."elections" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_elections_admin_update" ON public."elections" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_read_audit_log(community_id))
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_tenant_select" ON public."elections" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_emergency_broadcast_recipients_delete" ON public."emergency_broadcast_recipients" AS PERMISSIVE FOR DELETE TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id))));
CREATE POLICY "pp_emergency_broadcast_recipients_insert" ON public."emergency_broadcast_recipients" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id))));
CREATE POLICY "pp_emergency_broadcast_recipients_select" ON public."emergency_broadcast_recipients" AS PERMISSIVE FOR SELECT TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id))));
CREATE POLICY "pp_emergency_broadcast_recipients_update" ON public."emergency_broadcast_recipients" AS PERMISSIVE FOR UPDATE TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id))))
  WITH CHECK ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id))));
CREATE POLICY "pp_emergency_broadcasts_delete" ON public."emergency_broadcasts" AS PERMISSIVE FOR DELETE TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id))));
CREATE POLICY "pp_emergency_broadcasts_insert" ON public."emergency_broadcasts" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id))));
CREATE POLICY "pp_emergency_broadcasts_select" ON public."emergency_broadcasts" AS PERMISSIVE FOR SELECT TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id))));
CREATE POLICY "pp_emergency_broadcasts_update" ON public."emergency_broadcasts" AS PERMISSIVE FOR UPDATE TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id))))
  WITH CHECK ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id))));
CREATE POLICY "pp_esign_consent_admin_delete" ON public."esign_consent" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_esign_consent_insert" ON public."esign_consent" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((pp_rls_can_access_community(community_id) AND ((user_id = auth.uid()) OR pp_rls_can_read_audit_log(community_id))));
CREATE POLICY "pp_esign_consent_update" ON public."esign_consent" AS PERMISSIVE FOR UPDATE TO public
  USING ((pp_rls_can_access_community(community_id) AND ((user_id = auth.uid()) OR pp_rls_can_read_audit_log(community_id))))
  WITH CHECK ((pp_rls_can_access_community(community_id) AND ((user_id = auth.uid()) OR pp_rls_can_read_audit_log(community_id))));
CREATE POLICY "pp_tenant_select" ON public."esign_consent" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_esign_events_admin_insert" ON public."esign_events" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_tenant_select" ON public."esign_events" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_esign_admin_delete" ON public."esign_signers" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_esign_admin_insert" ON public."esign_signers" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_esign_admin_update" ON public."esign_signers" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_read_audit_log(community_id))
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_tenant_select" ON public."esign_signers" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_esign_admin_delete" ON public."esign_submissions" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_esign_admin_insert" ON public."esign_submissions" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_esign_admin_update" ON public."esign_submissions" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_read_audit_log(community_id))
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_tenant_select" ON public."esign_submissions" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_esign_admin_delete" ON public."esign_templates" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_esign_admin_insert" ON public."esign_templates" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_esign_admin_update" ON public."esign_templates" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_read_audit_log(community_id))
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_tenant_select" ON public."esign_templates" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "faqs_community_delete" ON public."faqs" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "faqs_community_insert" ON public."faqs" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "faqs_community_read" ON public."faqs" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "faqs_community_update" ON public."faqs" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "faqs_service_bypass" ON public."faqs" AS PERMISSIVE FOR ALL TO public
  USING (pp_rls_is_privileged());
CREATE POLICY "pp_finance_webhook_insert" ON public."finance_stripe_webhook_events" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_finance_webhook_select" ON public."finance_stripe_webhook_events" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_delete" ON public."forum_replies" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_insert" ON public."forum_replies" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_select" ON public."forum_replies" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_update" ON public."forum_replies" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_access_community(community_id))
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_delete" ON public."forum_threads" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_insert" ON public."forum_threads" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_select" ON public."forum_threads" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_update" ON public."forum_threads" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_access_community(community_id))
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "help_article_feedback_community_delete" ON public."help_article_feedback" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "help_article_feedback_community_insert" ON public."help_article_feedback" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "help_article_feedback_community_read" ON public."help_article_feedback" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "help_article_feedback_community_update" ON public."help_article_feedback" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "help_article_feedback_service_bypass" ON public."help_article_feedback" AS PERMISSIVE FOR ALL TO public
  USING (pp_rls_is_privileged());
CREATE POLICY "help_article_views_community_insert" ON public."help_article_views" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "help_article_views_community_read" ON public."help_article_views" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "help_article_views_service_bypass" ON public."help_article_views" AS PERMISSIVE FOR ALL TO public
  USING (pp_rls_is_privileged());
CREATE POLICY "pp_invitations_delete" ON public."invitations" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_invitations_insert" ON public."invitations" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_invitations_update" ON public."invitations" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_read_audit_log(community_id))
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_tenant_select" ON public."invitations" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_leases_delete" ON public."leases" AS PERMISSIVE FOR DELETE TO public
  USING ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR pp_rls_community_allows_member_writes(community_id, 'leasesWriteLevel'::text)))));
CREATE POLICY "pp_leases_insert" ON public."leases" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR pp_rls_community_allows_member_writes(community_id, 'leasesWriteLevel'::text)))));
CREATE POLICY "pp_leases_update" ON public."leases" AS PERMISSIVE FOR UPDATE TO public
  USING ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR pp_rls_community_allows_member_writes(community_id, 'leasesWriteLevel'::text)))))
  WITH CHECK ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR pp_rls_community_allows_member_writes(community_id, 'leasesWriteLevel'::text)))));
CREATE POLICY "pp_tenant_select" ON public."leases" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_ledger_entries_delete" ON public."ledger_entries" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_ledger_entries_insert" ON public."ledger_entries" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_ledger_entries_update" ON public."ledger_entries" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_read_audit_log(community_id))
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_tenant_select" ON public."ledger_entries" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_maintenance_comments_insert" ON public."maintenance_comments" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND (user_id = auth.uid()) AND pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR (EXISTS ( SELECT 1
   FROM maintenance_requests mr
  WHERE ((mr.id = maintenance_comments.request_id) AND (mr.community_id = mr.community_id) AND (mr.submitted_by_id = auth.uid()) AND (mr.deleted_at IS NULL))))))));
CREATE POLICY "pp_tenant_select" ON public."maintenance_comments" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_maintenance_requests_delete" ON public."maintenance_requests" AS PERMISSIVE FOR DELETE TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR (submitted_by_id = auth.uid())))));
CREATE POLICY "pp_maintenance_requests_select" ON public."maintenance_requests" AS PERMISSIVE FOR SELECT TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR (submitted_by_id = auth.uid())))));
CREATE POLICY "pp_maintenance_requests_update" ON public."maintenance_requests" AS PERMISSIVE FOR UPDATE TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR (submitted_by_id = auth.uid())))))
  WITH CHECK ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR (submitted_by_id = auth.uid())))));
CREATE POLICY "pp_tenant_insert" ON public."maintenance_requests" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_meeting_documents_delete" ON public."meeting_documents" AS PERMISSIVE FOR DELETE TO public
  USING ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR pp_rls_community_allows_member_writes(community_id, 'meetingDocumentsWriteLevel'::text)))));
CREATE POLICY "pp_meeting_documents_insert" ON public."meeting_documents" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR pp_rls_community_allows_member_writes(community_id, 'meetingDocumentsWriteLevel'::text)))));
CREATE POLICY "pp_meeting_documents_update" ON public."meeting_documents" AS PERMISSIVE FOR UPDATE TO public
  USING ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR pp_rls_community_allows_member_writes(community_id, 'meetingDocumentsWriteLevel'::text)))))
  WITH CHECK ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR pp_rls_community_allows_member_writes(community_id, 'meetingDocumentsWriteLevel'::text)))));
CREATE POLICY "pp_tenant_select" ON public."meeting_documents" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_meetings_delete" ON public."meetings" AS PERMISSIVE FOR DELETE TO public
  USING ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR pp_rls_community_allows_member_writes(community_id, 'meetingsWriteLevel'::text)))));
CREATE POLICY "pp_meetings_insert" ON public."meetings" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR pp_rls_community_allows_member_writes(community_id, 'meetingsWriteLevel'::text)))));
CREATE POLICY "pp_meetings_update" ON public."meetings" AS PERMISSIVE FOR UPDATE TO public
  USING ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR pp_rls_community_allows_member_writes(community_id, 'meetingsWriteLevel'::text)))))
  WITH CHECK ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR pp_rls_community_allows_member_writes(community_id, 'meetingsWriteLevel'::text)))));
CREATE POLICY "pp_tenant_select" ON public."meetings" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "move_checklists_community_delete" ON public."move_checklists" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "move_checklists_community_insert" ON public."move_checklists" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "move_checklists_community_read" ON public."move_checklists" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "move_checklists_community_update" ON public."move_checklists" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "move_checklists_service_bypass" ON public."move_checklists" AS PERMISSIVE FOR ALL TO public
  USING (pp_rls_is_privileged());
CREATE POLICY "pp_service_delete" ON public."notification_digest_queue" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_is_privileged());
CREATE POLICY "pp_service_insert" ON public."notification_digest_queue" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_is_privileged());
CREATE POLICY "pp_service_select" ON public."notification_digest_queue" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_is_privileged());
CREATE POLICY "pp_service_update" ON public."notification_digest_queue" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_is_privileged())
  WITH CHECK (pp_rls_is_privileged());
CREATE POLICY "pp_notification_preferences_delete" ON public."notification_preferences" AS PERMISSIVE FOR DELETE TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR (user_id = auth.uid())))));
CREATE POLICY "pp_notification_preferences_insert" ON public."notification_preferences" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR (user_id = auth.uid())))));
CREATE POLICY "pp_notification_preferences_select" ON public."notification_preferences" AS PERMISSIVE FOR SELECT TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR (user_id = auth.uid())))));
CREATE POLICY "pp_notification_preferences_update" ON public."notification_preferences" AS PERMISSIVE FOR UPDATE TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR (user_id = auth.uid())))))
  WITH CHECK ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR (user_id = auth.uid())))));
CREATE POLICY "notifications_user_select" ON public."notifications" AS PERMISSIVE FOR SELECT TO public
  USING ((user_id = auth.uid()));
CREATE POLICY "notifications_user_update" ON public."notifications" AS PERMISSIVE FOR UPDATE TO public
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "checklist_items_insert_own" ON public."onboarding_checklist_items" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((community_id = (current_setting('app.community_id'::text, true))::bigint) AND (user_id = auth.uid())));
CREATE POLICY "checklist_items_select_own" ON public."onboarding_checklist_items" AS PERMISSIVE FOR SELECT TO public
  USING (((community_id = (current_setting('app.community_id'::text, true))::bigint) AND (user_id = auth.uid())));
CREATE POLICY "checklist_items_update_own" ON public."onboarding_checklist_items" AS PERMISSIVE FOR UPDATE TO public
  USING (((community_id = (current_setting('app.community_id'::text, true))::bigint) AND (user_id = auth.uid())));
CREATE POLICY "pp_onboarding_wizard_state_delete" ON public."onboarding_wizard_state" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_onboarding_wizard_state_insert" ON public."onboarding_wizard_state" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_onboarding_wizard_state_update" ON public."onboarding_wizard_state" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_read_audit_log(community_id))
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_tenant_select" ON public."onboarding_wizard_state" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_package_log_delete" ON public."package_log" AS PERMISSIVE FOR DELETE TO public
  USING ((pp_rls_can_access_community(community_id) AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))));
CREATE POLICY "pp_package_log_insert" ON public."package_log" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((pp_rls_can_access_community(community_id) AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))));
CREATE POLICY "pp_package_log_update" ON public."package_log" AS PERMISSIVE FOR UPDATE TO public
  USING ((pp_rls_can_access_community(community_id) AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))))
  WITH CHECK ((pp_rls_can_access_community(community_id) AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))));
CREATE POLICY "pp_tenant_select" ON public."package_log" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_poll_votes_insert" ON public."poll_votes" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((pp_rls_can_access_community(community_id) AND (pp_rls_is_privileged() OR (user_id = auth.uid()))));
CREATE POLICY "pp_poll_votes_select" ON public."poll_votes" AS PERMISSIVE FOR SELECT TO public
  USING ((pp_rls_can_access_community(community_id) AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id) OR (user_id = auth.uid()))));
CREATE POLICY "pp_tenant_delete" ON public."polls" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_insert" ON public."polls" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_select" ON public."polls" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_update" ON public."polls" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_access_community(community_id))
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_service_delete" ON public."provisioning_jobs" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_is_privileged());
CREATE POLICY "pp_service_insert" ON public."provisioning_jobs" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_is_privileged());
CREATE POLICY "pp_service_select" ON public."provisioning_jobs" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_is_privileged());
CREATE POLICY "pp_service_update" ON public."provisioning_jobs" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_is_privileged())
  WITH CHECK (pp_rls_is_privileged());
CREATE POLICY "pp_rent_obligations_delete" ON public."rent_obligations" AS PERMISSIVE FOR DELETE TO public
  USING ((pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)));
CREATE POLICY "pp_rent_obligations_insert" ON public."rent_obligations" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)));
CREATE POLICY "pp_rent_obligations_update" ON public."rent_obligations" AS PERMISSIVE FOR UPDATE TO public
  USING ((pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)))
  WITH CHECK ((pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)));
CREATE POLICY "pp_tenant_select" ON public."rent_obligations" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_rent_payments_delete" ON public."rent_payments" AS PERMISSIVE FOR DELETE TO public
  USING ((pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)));
CREATE POLICY "pp_rent_payments_insert" ON public."rent_payments" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)));
CREATE POLICY "pp_rent_payments_update" ON public."rent_payments" AS PERMISSIVE FOR UPDATE TO public
  USING ((pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)))
  WITH CHECK ((pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id)));
CREATE POLICY "pp_tenant_select" ON public."rent_payments" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "site_blocks_anon_read" ON public."site_blocks" AS PERMISSIVE FOR SELECT TO anon
  USING (((is_draft = false) AND (community_id = (COALESCE(NULLIF(current_setting('app.community_id'::text, true), ''::text), '0'::text))::bigint)));
CREATE POLICY "site_blocks_read_published" ON public."site_blocks" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((is_draft = false) AND (community_id = (current_setting('app.community_id'::text))::bigint)));
CREATE POLICY "site_blocks_service_role" ON public."site_blocks" AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
CREATE POLICY "pp_stripe_connected_accounts_delete" ON public."stripe_connected_accounts" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_stripe_connected_accounts_insert" ON public."stripe_connected_accounts" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_stripe_connected_accounts_update" ON public."stripe_connected_accounts" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_read_audit_log(community_id))
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_tenant_select" ON public."stripe_connected_accounts" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "access_log_community_read" ON public."support_access_log" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "access_log_service_bypass" ON public."support_access_log" AS PERMISSIVE FOR ALL TO public
  USING (pp_rls_is_privileged());
CREATE POLICY "consent_community_read" ON public."support_consent_grants" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "consent_service_bypass" ON public."support_consent_grants" AS PERMISSIVE FOR ALL TO public
  USING (pp_rls_is_privileged());
CREATE POLICY "support_sessions_service_bypass" ON public."support_sessions" AS PERMISSIVE FOR ALL TO public
  USING (pp_rls_is_privileged());
CREATE POLICY "pp_tenant_select" ON public."units" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_units_delete" ON public."units" AS PERMISSIVE FOR DELETE TO public
  USING ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR pp_rls_community_allows_member_writes(community_id, 'unitsWriteLevel'::text)))));
CREATE POLICY "pp_units_insert" ON public."units" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR pp_rls_community_allows_member_writes(community_id, 'unitsWriteLevel'::text)))));
CREATE POLICY "pp_units_update" ON public."units" AS PERMISSIVE FOR UPDATE TO public
  USING ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR pp_rls_community_allows_member_writes(community_id, 'unitsWriteLevel'::text)))))
  WITH CHECK ((pp_rls_is_privileged() OR (pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR pp_rls_community_allows_member_writes(community_id, 'unitsWriteLevel'::text)))));
CREATE POLICY "pp_tenant_select" ON public."user_roles" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_user_roles_delete" ON public."user_roles" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_user_roles_insert" ON public."user_roles" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_user_roles_update" ON public."user_roles" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_read_audit_log(community_id))
  WITH CHECK (pp_rls_can_read_audit_log(community_id));
CREATE POLICY "pp_tenant_delete" ON public."vendors" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_insert" ON public."vendors" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_select" ON public."vendors" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_update" ON public."vendors" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_access_community(community_id))
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_delete" ON public."violation_fines" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_insert" ON public."violation_fines" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_select" ON public."violation_fines" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_update" ON public."violation_fines" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_access_community(community_id))
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_delete" ON public."violations" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_insert" ON public."violations" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_select" ON public."violations" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_update" ON public."violations" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_access_community(community_id))
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_select" ON public."visitor_log" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_visitor_log_delete" ON public."visitor_log" AS PERMISSIVE FOR DELETE TO public
  USING ((pp_rls_can_access_community(community_id) AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))));
CREATE POLICY "pp_visitor_log_insert" ON public."visitor_log" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((pp_rls_can_access_community(community_id) AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))));
CREATE POLICY "pp_visitor_log_update" ON public."visitor_log" AS PERMISSIVE FOR UPDATE TO public
  USING ((pp_rls_can_access_community(community_id) AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))))
  WITH CHECK ((pp_rls_can_access_community(community_id) AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))));
CREATE POLICY "pp_tenant_delete" ON public."work_orders" AS PERMISSIVE FOR DELETE TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_insert" ON public."work_orders" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_select" ON public."work_orders" AS PERMISSIVE FOR SELECT TO public
  USING (pp_rls_can_access_community(community_id));
CREATE POLICY "pp_tenant_update" ON public."work_orders" AS PERMISSIVE FOR UPDATE TO public
  USING (pp_rls_can_access_community(community_id))
  WITH CHECK (pp_rls_can_access_community(community_id));

-- Triggers
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."accounting_connections";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.accounting_connections FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."amenities";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.amenities FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."amenity_reservations";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.amenity_reservations FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."announcements";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."arc_submissions";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.arc_submissions FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."assessment_line_items";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.assessment_line_items FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."assessments";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.assessments FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."calendar_sync_tokens";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.calendar_sync_tokens FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS trg_demo_timestamps ON public."communities";
CREATE TRIGGER trg_demo_timestamps BEFORE INSERT ON public.communities FOR EACH ROW EXECUTE FUNCTION enforce_demo_timestamps();
DROP TRIGGER IF EXISTS compliance_audit_log_append_only_guard ON public."compliance_audit_log";
CREATE TRIGGER compliance_audit_log_append_only_guard BEFORE DELETE OR UPDATE ON public.compliance_audit_log FOR EACH ROW EXECUTE FUNCTION prevent_compliance_audit_log_mutation();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."compliance_checklist_items";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.compliance_checklist_items FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."contract_bids";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.contract_bids FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."contracts";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS enforce_denied_visitors_community_scope ON public."denied_visitors";
CREATE TRIGGER enforce_denied_visitors_community_scope BEFORE INSERT OR UPDATE ON public.denied_visitors FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."document_categories";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.document_categories FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS document_drafts_tenant_scope ON public."document_drafts";
CREATE TRIGGER document_drafts_tenant_scope BEFORE INSERT OR UPDATE ON public.document_drafts FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."documents";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."election_ballot_submissions";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT ON public.election_ballot_submissions FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."election_ballots";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT ON public.election_ballots FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."election_candidates";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.election_candidates FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."election_eligibility_snapshots";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT ON public.election_eligibility_snapshots FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."election_proxies";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.election_proxies FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."elections";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.elections FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."esign_consent";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.esign_consent FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."esign_events";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.esign_events FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."esign_signers";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.esign_signers FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."esign_submissions";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.esign_submissions FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."esign_templates";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.esign_templates FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS faqs_tenant_scope ON public."faqs";
CREATE TRIGGER faqs_tenant_scope BEFORE INSERT OR UPDATE ON public.faqs FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."finance_stripe_webhook_events";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT ON public.finance_stripe_webhook_events FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."forum_replies";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.forum_replies FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."forum_threads";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.forum_threads FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS help_article_feedback_tenant_scope ON public."help_article_feedback";
CREATE TRIGGER help_article_feedback_tenant_scope BEFORE INSERT OR UPDATE ON public.help_article_feedback FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS help_article_views_tenant_scope ON public."help_article_views";
CREATE TRIGGER help_article_views_tenant_scope BEFORE INSERT OR UPDATE ON public.help_article_views FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."invitations";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.invitations FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS leases_enforce_renewal_continuity ON public."leases";
CREATE TRIGGER leases_enforce_renewal_continuity BEFORE INSERT OR UPDATE ON public.leases FOR EACH ROW EXECUTE FUNCTION pp_enforce_lease_renewal_continuity();
DROP TRIGGER IF EXISTS leases_sync_unit_rent_amount ON public."leases";
CREATE TRIGGER leases_sync_unit_rent_amount AFTER INSERT OR DELETE OR UPDATE OF unit_id, start_date, end_date, rent_amount, status, deleted_at ON public.leases FOR EACH ROW EXECUTE FUNCTION pp_leases_sync_unit_rent_amount();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."leases";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.leases FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."ledger_entries";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.ledger_entries FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."maintenance_comments";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.maintenance_comments FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."maintenance_requests";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.maintenance_requests FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."meeting_documents";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.meeting_documents FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."meetings";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS move_checklists_tenant_scope ON public."move_checklists";
CREATE TRIGGER move_checklists_tenant_scope BEFORE INSERT OR UPDATE ON public.move_checklists FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."notification_preferences";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS notifications_enforce_tenant_scope ON public."notifications";
CREATE TRIGGER notifications_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS enforce_community_scope_onboarding_checklist_items ON public."onboarding_checklist_items";
CREATE TRIGGER enforce_community_scope_onboarding_checklist_items BEFORE INSERT OR UPDATE ON public.onboarding_checklist_items FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."onboarding_wizard_state";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.onboarding_wizard_state FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."package_log";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.package_log FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."poll_votes";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.poll_votes FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."polls";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.polls FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."rent_obligations";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.rent_obligations FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."rent_payments";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.rent_payments FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."stripe_connected_accounts";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.stripe_connected_accounts FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS support_access_log_append_only_guard ON public."support_access_log";
CREATE TRIGGER support_access_log_append_only_guard BEFORE DELETE OR UPDATE ON public.support_access_log FOR EACH ROW EXECUTE FUNCTION prevent_support_access_log_mutation();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."units";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS units_block_direct_rent_amount_write ON public."units";
CREATE TRIGGER units_block_direct_rent_amount_write BEFORE UPDATE OF rent_amount ON public.units FOR EACH ROW EXECUTE FUNCTION pp_block_direct_unit_rent_amount_write();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."user_roles";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."vendors";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.vendors FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."violation_fines";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.violation_fines FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."violations";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.violations FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."visitor_log";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.visitor_log FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."work_orders";
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();

