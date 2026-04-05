/**
 * Communities table — the core tenant entity.
 * Every tenant-scoped table references communities.id.
 */
import { bigint, bigserial, boolean, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
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
  /** Phase 3: When the community's public site was last published. */
  sitePublishedAt: timestamp('site_published_at', { withTimezone: true }),
  /** Mobile help: management contact info. */
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  /** Public compliance transparency page opt-in toggle. */
  transparencyEnabled: boolean('transparency_enabled').notNull().default(false),
  /** Timestamp when transparency scope disclosure was acknowledged by an authorized user. */
  transparencyAcknowledgedAt: timestamp('transparency_acknowledged_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
