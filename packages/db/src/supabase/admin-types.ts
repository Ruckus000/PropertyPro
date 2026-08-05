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

/** Platform-level inbound lead from the marketing site. See migration 0050. */
export type MarketingLeadRow = {
  id: number;
  email: string;
  email_normalized: string;
  association_name: string | null;
  contact_name: string | null;
  association_type: string | null;
  unit_count: number | null;
  obligation_required: string | null;
  source: string;
  status: 'new' | 'contacted' | 'qualified' | 'disqualified';
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MarketingLeadUpdate = Partial<
  Pick<MarketingLeadRow, 'status' | 'notes' | 'updated_at'>
>;

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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
