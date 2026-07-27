/**
 * Communities table — the core tenant entity.
 * Every tenant-scoped table references communities.id.
 */
import { sql } from 'drizzle-orm';
import { bigint, bigserial, boolean, check, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { communityTypeEnum } from './enums';
import { billingGroups } from './billing-groups';

export const communities = pgTable('communities', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  communityType: communityTypeEnum('community_type').notNull(),
  /** AGENTS #19: Florida spans Eastern + Central. Timezone is per-community. */
  timezone: text('timezone').notNull().default('America/New_York'),
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  city: text('city'),
  state: text('state'),
  zipCode: text('zip_code'),
  /** P2-38: Community logo — Supabase Storage path (stored via onboarding wizard). */
  logoPath: text('logo_path'),
  /** P3-47: White-label branding settings. Shape: { primaryColor?, secondaryColor?, logoPath? }.
   *  branding->>'logoPath' supersedes logo_path when present (migration window compatibility). */
  branding: jsonb('branding'),
  /** P4-55f: Per-community write-restriction settings for configurable-write tables.
   *  Absent key or 'all_members' = open writes (default, backward-compatible).
   *  'admin_only' = only admin-tier roles (board_member, board_president, cam,
   *  site_manager, property_manager_admin) may INSERT/UPDATE/DELETE.
   *  Enforced at RLS level via pp_rls_community_allows_member_writes(). */
  communitySettings: jsonb('community_settings')
    .$type<{
      announcementsWriteLevel?: 'all_members' | 'admin_only';
      meetingsWriteLevel?: 'all_members' | 'admin_only';
      meetingDocumentsWriteLevel?: 'all_members' | 'admin_only';
      unitsWriteLevel?: 'all_members' | 'admin_only';
      leasesWriteLevel?: 'all_members' | 'admin_only';
      documentCategoriesWriteLevel?: 'all_members' | 'admin_only';
      electionsAttorneyReviewed?: boolean;
      paymentFeePolicy?: 'owner_pays' | 'association_absorbs';
      allowResidentVisitorRevoke?: boolean;
    }>()
    .notNull()
    .default({}),
  /** Billing group for PM volume discount consolidation. Null = community billed independently. */
  billingGroupId: bigint('billing_group_id', { mode: 'number' }).references(
    () => billingGroups.id,
    { onDelete: 'set null' },
  ),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  subscriptionPlan: text('subscription_plan'),
  subscriptionStatus: text('subscription_status'),
  /** P2-34a: When the most recent invoice.payment_failed event was received. Null = no active failure. */
  paymentFailedAt: timestamp('payment_failed_at', { withTimezone: true }),
  /** P2-34a: When the next payment reminder email should be sent. Null = no pending reminder. */
  nextReminderAt: timestamp('next_reminder_at', { withTimezone: true }),
  /** P2-34a: When the subscription was canceled (start of 30-day grace period). Null = not canceled. */
  subscriptionCanceledAt: timestamp('subscription_canceled_at', { withTimezone: true }),
  /** Stripe subscription current_period_end — trial end or renewal date for in-app banners. */
  subscriptionCurrentPeriodEndAt: timestamp('subscription_current_period_end_at', { withTimezone: true }),
  /** Admin metrics: why the community canceled (e.g. 'price', 'missing_feature', 'switching'). Validated at API boundary. */
  cancellationReason: text('cancellation_reason'),
  /** Admin metrics: free-text elaboration on the cancellation reason. */
  cancellationNote: text('cancellation_note'),
  /** Admin metrics: when the cancellation reason was captured. */
  cancellationCapturedAt: timestamp('cancellation_captured_at', { withTimezone: true }),
  /** Account lifecycle: denormalized from access_plans for fast subscription guard check. */
  freeAccessExpiresAt: timestamp('free_access_expires_at', { withTimezone: true }),
  /** Admin: true for demo communities created via the admin console. */
  isDemo: boolean('is_demo').notNull().default(false),
  /** Admin: reserved for future auto-expiry. Demos persist until manually deleted. */
  demoExpiresAt: timestamp('demo_expires_at', { withTimezone: true }),
  /** Demo lifecycle: when full-feature trial access ends. Grace period = trial_ends_at → demo_expires_at. */
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  /** Phase 3: Optional custom domain for the community's public site. */
  customDomain: text('custom_domain'),
  /** Phase 2: lifecycle of the custom domain — null | 'pending' | 'active' | 'error'. */
  customDomainStatus: text('custom_domain_status'),
  /** Phase 2: when the custom domain first became active. */
  customDomainVerifiedAt: timestamp('custom_domain_verified_at', { withTimezone: true }),
  /** Phase 3: When the community's public site was last published. */
  sitePublishedAt: timestamp('site_published_at', { withTimezone: true }),
  /** Site onboarding wizard: when the PM finished the wizard (clicked Publish on
   *  the final step). Null = wizard never completed. Authoritative completion
   *  signal that supersedes the prior `branding.layoutId`-unset heuristic. */
  siteOnboardingCompletedAt: timestamp('site_onboarding_completed_at', { withTimezone: true }),
  /** Site onboarding wizard: resume state for a partially-completed wizard.
   *  `lastCompletedStep` is the 1-based index of the furthest step the PM
   *  finished, used to deep-link the "Resume customizing" banner. Null = no
   *  saved progress. */
  siteOnboardingProgress: jsonb('site_onboarding_progress').$type<{
    lastCompletedStep?: number;
  }>(),
  /** Mobile help: management contact info. */
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  /** Public compliance transparency page opt-in toggle. */
  transparencyEnabled: boolean('transparency_enabled').notNull().default(false),
  /** Timestamp when transparency scope disclosure was acknowledged by an authorized user. */
  transparencyAcknowledgedAt: timestamp('transparency_acknowledged_at', { withTimezone: true }),
  /** Snowbird digest board opt-in — when true, owners receive the periodic recap unless they opt out. */
  snowbirdDigestEnabled: boolean('snowbird_digest_enabled').notNull().default(false),
  /**
   * Website editor v3 Phase 7 — the urgent notice banner shown on every page of
   * the community's public site.
   *
   * Columns on `communities` rather than a table because the banner is a
   * per-community SINGLETON: exactly one is live at a time, and per-notice
   * history is already covered by `compliance_audit_log`. The public renderer
   * reads this row once per request anyway (`getCommunityPublicInfo`), so the
   * banner costs the statutory public entry point zero extra queries.
   *
   * This write BYPASSES the draft/publish layer — it is public the moment it
   * lands. The 240-character cap is therefore enforced three times: the Zod
   * request schema, the service, and a DB CHECK (see below).
   *
   * Null `urgentNoticeText` means no notice. Null `urgentNoticeExpiresAt` means
   * it stays up until a manager removes it. Expiry is compared at RENDER time,
   * never by a sweep, so a missed cron can never strand a live banner.
   */
  urgentNoticeText: text('urgent_notice_text'),
  urgentNoticeExpiresAt: timestamp('urgent_notice_expires_at', { withTimezone: true }),
  urgentNoticeSetAt: timestamp('urgent_notice_set_at', { withTimezone: true }),
  /**
   * Who posted it. No FK declared here: this references `auth.users`, a
   * different schema that drizzle cannot express. The constraint is added in
   * migration 0042 instead — same convention as `site_publish_snapshots
   * .actor_user_id` and `user_search_index`.
   */
  urgentNoticeSetBy: uuid('urgent_notice_set_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  // Hourly payment-alert-scheduler cron filters communities by next_reminder_at IS NOT NULL.
  // Partial index keeps the scan cheap regardless of total community count.
  index('communities_next_reminder_at_idx')
    .on(table.nextReminderAt)
    .where(sql`next_reminder_at IS NOT NULL`),
  // Partial unique index: one community per custom domain (among live rows).
  // Mirrors migration 0012 — declared here so drizzle-kit generate does not
  // emit a DROP INDEX on the next schema diff.
  uniqueIndex('communities_custom_domain_unique')
    .on(table.customDomain)
    .where(sql`custom_domain IS NOT NULL AND deleted_at IS NULL`),
  // The urgent notice is public the instant it is written — no draft, no
  // review. The 240-char cap is enforced at the Zod boundary and again in the
  // service; this is the backstop that survives a future caller skipping both.
  // Declared here so drizzle-kit generate does not emit a DROP CONSTRAINT on
  // the next schema diff. Mirrors migration 0042.
  check(
    'communities_urgent_notice_text_len',
    sql`${table.urgentNoticeText} IS NULL OR char_length(${table.urgentNoticeText}) <= 240`,
  ),
]);
