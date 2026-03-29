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
  revoked_at: string | null;
  created_at: string;
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
  session_id: number;
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
  raw_user_meta_data: Record<string, unknown> | null;
};

export type AdminCommunityRow = {
  id: number;
  name: string;
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

export type AdminDatabase = {
  public: {
    Tables: {
      support_consent_grants: AdminTable<SupportConsentGrantRow>;
      platform_admin_users: AdminTable<PlatformAdminUserRow>;
      support_sessions: AdminTable<
        SupportSessionRow,
        Omit<SupportSessionRow, 'id' | 'created_at' | 'ended_at' | 'ended_reason'> & {
          id?: number;
          created_at?: string;
          ended_at?: string | null;
          ended_reason?: string | null;
        },
        Partial<SupportSessionRow>
      >;
      support_access_log: AdminTable<
        SupportAccessLogRow,
        Omit<SupportAccessLogRow, 'id' | 'created_at'> & {
          id?: number;
          created_at?: string;
        },
        Partial<SupportAccessLogRow>
      >;
      access_plans: AdminTable<
        AccessPlanRow,
        Omit<AccessPlanRow, 'id' | 'created_at' | 'revoked_at' | 'revoked_by' | 'converted_at'> & {
          id?: number;
          created_at?: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          converted_at?: string | null;
        },
        Partial<AccessPlanRow>
      >;
      account_deletion_requests: AdminTable<AccountDeletionRequestRow>;
      users: AdminTable<AdminUserRow>;
      communities: AdminTable<AdminCommunityRow>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
