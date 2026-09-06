/**
 * Typed interfaces for Supabase admin-client tables that are not yet in
 * the auto-generated types.  Used by `createAdminTypedClient()` to provide
 * type-safe `.from()` calls instead of `as any` casts.
 *
 * NOTE: We use `type` aliases (not `interface`) because interfaces lack the
 * implicit index signature that Supabase's `Record<string, unknown>` constraint
 * requires.
 *
 * @module supabase/admin-types
 */

import type { SupportMailbox, SupportThreadStatus } from '@propertypro/shared';

// ─── Support ───

export type SupportConsentGrantRow = {
  id: number;
  community_id: number;
  access_level: string;
  granted_by: string;
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  created_at: string;
  deleted_at: string | null;
};

export type PlatformAdminUserRow = {
  user_id: string;
  email: string;
  created_at: string;
};

export type SupportSessionRow = {
  id: number;
  admin_user_id: string;
  target_user_id: string;
  community_id: number;
  reason: string;
  ticket_id: string | null;
  access_level: string;
  consent_id: number;
  expires_at: string;
  ended_at: string | null;
  ended_reason: string | null;
  created_at: string;
};

export type SupportAccessLogRow = {
  id: number;
  session_id: number | null;
  admin_user_id: string;
  community_id: number;
  event: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

// ─── Access Plans ───

export type AccessPlanRow = {
  id: number;
  community_id: number;
  expires_at: string;
  grace_ends_at: string;
  duration_months: number;
  grace_period_days: number;
  granted_by: string;
  notes: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  converted_at: string | null;
  created_at: string;
};

// ─── Account Deletion ───

export type AccountDeletionRequestRow = {
  id: number;
  request_type: 'user' | 'community';
  user_id: string;
  community_id: number | null;
  status: 'cooling' | 'soft_deleted' | 'purged' | 'cancelled' | 'recovered';
  cooling_ends_at: string;
  scheduled_purge_at: string | null;
  purged_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  recovered_at: string | null;
  intervention_notes: string | null;
  created_at: string;
};

// ─── Auth users (admin view) ───

export type AdminUserRow = {
  id: string;
  email: string;
  full_name: string;
  raw_user_meta_data: Record<string, unknown> | null;
  deleted_at: string | null;
};

export type AdminCommunityRow = {
  id: number;
  name: string;
  slug: string;
  timezone: string;
  community_type: 'condo_718' | 'hoa_720' | 'apartment';
  // Denormalized free-access grace expiry read by the subscription guard.
  free_access_expires_at: string | null;
  deleted_at: string | null;
};

// ─── Database definition for typed client ───
//
// Matches the GenericSchema shape required by @supabase/supabase-js v2:
//   Tables → { Row, Insert, Update, Relationships }
//   Views  → Record<string, ...>
//   Functions → Record<string, ...>

type AdminTable<
  R extends Record<string, unknown>,
  I extends Record<string, unknown> = R,
  U extends Record<string, unknown> = Partial<R>,
> = {
  Row: R;
  Insert: I;
  Update: U;
  Relationships: [];
};

// Fields that the database fills in (serial PKs, defaultNow timestamps,
// nullable columns) — callers shouldn't have to provide them on Insert.
type ConsentGrantInsert = Omit<
  SupportConsentGrantRow,
  'id' | 'access_level' | 'granted_at' | 'expires_at' | 'revoked_at' | 'revoked_by' | 'created_at' | 'deleted_at'
> & {
  id?: number;
  access_level?: string;
  granted_at?: string;
  expires_at?: string | null;
  revoked_at?: string | null;
  revoked_by?: string | null;
  created_at?: string;
  deleted_at?: string | null;
};

type SupportSessionInsert = Omit<
  SupportSessionRow,
  'id' | 'created_at' | 'ended_at' | 'ended_reason' | 'ticket_id'
> & {
  id?: number;
  created_at?: string;
  ended_at?: string | null;
  ended_reason?: string | null;
  ticket_id?: string | null;
};

type SupportAccessLogInsert = Omit<
  SupportAccessLogRow,
  'id' | 'created_at' | 'session_id' | 'metadata'
> & {
  id?: number;
  created_at?: string;
  session_id?: number | null;
  metadata?: Record<string, unknown> | null;
};

type AccessPlanInsert = Omit<
  AccessPlanRow,
  'id' | 'created_at' | 'revoked_at' | 'revoked_by' | 'converted_at' | 'notes'
> & {
  id?: number;
  created_at?: string;
  revoked_at?: string | null;
  revoked_by?: string | null;
  converted_at?: string | null;
  notes?: string | null;
};

type SiteThemePresetInsert = Omit<
  SiteThemePresetRow,
  'id' | 'created_at' | 'updated_at' | 'description' | 'tier' | 'is_archived' | 'is_featured' | 'version'
> & {
  id?: number;
  created_at?: string;
  updated_at?: string;
  description?: string | null;
  tier?: 'essentials' | 'professional' | 'pm';
  is_archived?: boolean;
  is_featured?: boolean;
  version?: number;
};

type SiteStarterPackInsert = Omit<
  SiteStarterPackRow,
  'id' | 'created_at' | 'updated_at' | 'description' | 'is_archived' | 'version'
> & {
  id?: number;
  created_at?: string;
  updated_at?: string;
  description?: string | null;
  is_archived?: boolean;
  version?: number;
};

// ─── Site templates ───

export type SiteThemePresetRow = {
  id: number;
  slug: string;
  display_name: string;
  description: string | null;
  tokens: unknown;
  tier: 'essentials' | 'professional' | 'pm';
  is_archived: boolean;
  is_featured: boolean;
  version: number;
  created_at: string;
  updated_at: string;
};

export type SiteStarterPackRow = {
  id: number;
  slug: string;
  display_name: string;
  community_type: 'condo_718' | 'hoa_720' | 'apartment';
  description: string | null;
  blocks: unknown;
  version: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type SiteBlockRow = {
  id: number;
  community_id: number;
  block_order: number;
  block_type: string;
  content: unknown;
  is_draft: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type SiteBlockInsert = {
  id?: number;
  community_id: number;
  block_order: number;
  block_type: string;
  content?: unknown;
  is_draft?: boolean;
  template_variant?: string;
  published_at?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
};

export type ComplianceAuditLogRow = {
  id: number;
  user_id: string | null;
  community_id: number;
  action: string;
  resource_type: string;
  resource_id: string;
  old_values: unknown | null;
  new_values: unknown | null;
  metadata: unknown | null;
  created_at: string;
};

type ComplianceAuditLogInsert = {
  id?: number;
  user_id?: string | null;
  community_id: number;
  action: string;
  resource_type: string;
  resource_id: string;
  old_values?: unknown | null;
  new_values?: unknown | null;
  metadata?: unknown | null;
  created_at?: string;
};

export type SiteLayoutMetadataRow = {
  id: number;
  slug: string;
  display_name: string;
  tagline: string | null;
  description: string | null;
  tier: 'essentials' | 'professional' | 'pm';
  is_archived: boolean;
  is_featured: boolean;
  default_preset_slug: string | null;
  version: string;
  created_at: string;
  updated_at: string;
};

// ─── Marketing ───

/**
 * Platform-level inbound lead from the marketing site.
 * See migrations 0050 (table) and 0051 (inquiry fields).
 */
export type MarketingLeadRow = {
  id: number;
  email: string;
  email_normalized: string;
  association_name: string | null;
  contact_name: string | null;
  association_type: string | null;
  unit_count: number | null;
  /** Portfolio size for a PM inquiry. Never conflate with `unit_count`. */
  community_count: number | null;
  /** Prospect's own words. Distinct from `notes`, which is sales-owned. */
  message: string | null;
  obligation_required: string | null;
  source: string;
  status: 'new' | 'contacted' | 'qualified' | 'disqualified';
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Deliberately excludes `message`: it is the prospect's text, not the admin's.
 * `notes` is where triage commentary belongs.
 */
export type MarketingLeadUpdate = Partial<
  Pick<MarketingLeadRow, 'status' | 'notes' | 'updated_at'>
>;

// ─── Support inbox ───
//
// Mail to support@/privacy@/contact@, received by the apps/web webhook over the
// privileged Drizzle connection and read/answered here over service_role.
// `mailbox` and `status` are typed from @propertypro/shared rather than
// re-declared, so a fourth mailbox is one edit.

export type SupportInboxThreadRow = {
  id: number;
  mailbox: SupportMailbox;
  subject: string;
  normalized_subject: string;
  participant_email: string;
  participant_name: string | null;
  status: SupportThreadStatus;
  first_message_at: string;
  last_message_at: string;
  message_count: number;
  created_at: string;
  updated_at: string;
};

/** The admin console only ever changes triage state. It never creates a thread. */
export type SupportInboxThreadUpdate = Partial<
  Pick<SupportInboxThreadRow, 'status' | 'last_message_at' | 'updated_at'>
>;

export type SupportInboxMessageRow = {
  id: number;
  thread_id: number;
  kind: 'email' | 'note';
  direction: 'inbound' | 'outbound' | 'internal';
  dedupe_key: string;
  rfc_message_id: string | null;
  in_reply_to: string | null;
  references_ids: string[] | null;
  delivered_to: string | null;
  from_email: string | null;
  from_name: string | null;
  to_emails: string[] | null;
  cc_emails: string[] | null;
  subject: string | null;
  text_body: string | null;
  /** RAW, UNSANITIZED sender HTML. Sanitize at render, never trust this. */
  html_body: string | null;
  sent_at: string | null;
  received_at: string;
  has_attachments: boolean;
  raw_payload: Record<string, unknown> | null;
  normalization_status: 'ok' | 'failed';
  provider_message_id: string | null;
  author_user_id: string | null;
  created_at: string;
};

/**
 * The admin console writes exactly two message shapes — an outbound reply and
 * an internal note. Both are `email`/`note` rows the database's
 * `support_inbox_messages_kind_shape_check` will reject if they are malformed,
 * so this type is a convenience, not the guarantee.
 */
export type SupportInboxMessageInsert = Omit<
  SupportInboxMessageRow,
  | 'id'
  | 'received_at'
  | 'has_attachments'
  | 'normalization_status'
  | 'raw_payload'
  | 'created_at'
> & {
  id?: number;
  received_at?: string;
  has_attachments?: boolean;
  normalization_status?: 'ok' | 'failed';
  /**
   * Optional here because the admin console never writes it. `raw_payload`
   * holds a quarantined provider payload, which only the web ingress produces
   * (over Drizzle, not this type) when a message cannot be normalized.
   */
  raw_payload?: Record<string, unknown> | null;
  created_at?: string;
};

export type AdminDatabase = {
  public: {
    Tables: {
      support_consent_grants: AdminTable<
        SupportConsentGrantRow,
        ConsentGrantInsert,
        Partial<SupportConsentGrantRow>
      >;
      platform_admin_users: AdminTable<PlatformAdminUserRow>;
      support_sessions: AdminTable<
        SupportSessionRow,
        SupportSessionInsert,
        Partial<SupportSessionRow>
      >;
      support_access_log: AdminTable<
        SupportAccessLogRow,
        SupportAccessLogInsert,
        Partial<SupportAccessLogRow>
      >;
      access_plans: AdminTable<
        AccessPlanRow,
        AccessPlanInsert,
        Partial<AccessPlanRow>
      >;
      account_deletion_requests: AdminTable<AccountDeletionRequestRow>;
      marketing_leads: AdminTable<
        MarketingLeadRow,
        MarketingLeadRow,
        MarketingLeadUpdate
      >;
      users: AdminTable<AdminUserRow>;
      communities: AdminTable<AdminCommunityRow>;
      site_theme_presets: AdminTable<
        SiteThemePresetRow,
        SiteThemePresetInsert,
        Partial<SiteThemePresetRow>
      >;
      site_layout_metadata: AdminTable<
        SiteLayoutMetadataRow,
        Partial<SiteLayoutMetadataRow>,
        Partial<SiteLayoutMetadataRow>
      >;
      site_starter_packs: AdminTable<
        SiteStarterPackRow,
        SiteStarterPackInsert,
        Partial<SiteStarterPackRow>
      >;
      site_blocks: AdminTable<
        SiteBlockRow,
        SiteBlockInsert,
        Partial<SiteBlockRow>
      >;
      compliance_audit_log: AdminTable<
        ComplianceAuditLogRow,
        ComplianceAuditLogInsert,
        Partial<ComplianceAuditLogRow>
      >;
      support_inbox_threads: AdminTable<
        SupportInboxThreadRow,
        Partial<SupportInboxThreadRow>,
        SupportInboxThreadUpdate
      >;
      support_inbox_messages: AdminTable<
        SupportInboxMessageRow,
        SupportInboxMessageInsert,
        Partial<SupportInboxMessageRow>
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
