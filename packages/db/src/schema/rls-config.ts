/**
 * P4-55 RLS inventory and policy-family config.
 *
 * This file is the source of truth for policy coverage tests so new tenant-scoped
 * tables do not silently miss RLS rollout.
 */

export type RlsPolicyFamily =
  | 'tenant_crud'              // All 4 ops gated on community membership
  | 'tenant_append_only'       // SELECT + INSERT only; UPDATE/DELETE blocked at RLS level
  | 'tenant_admin_write'       // SELECT on membership; INSERT/UPDATE/DELETE require admin-tier role
  | 'tenant_user_scoped'       // SELECT/UPDATE/DELETE scoped to auth.uid() for non-admins; admin-tier sees all; INSERT uses community-membership check (generic pp_tenant_insert) unless a bespoke insert policy replaces it
  | 'tenant_member_configurable' // SELECT on membership; INSERT/UPDATE/DELETE gated on community_settings JSONB (admin-tier always allowed; members allowed when setting is absent or 'all_members')
  | 'service_only'             // All ops require pp_rls_is_privileged()
  | 'audit_log_restricted'     // SELECT requires admin-tier role; INSERT requires privilege
  | 'public_read_service_write'; // anon + authenticated SELECT of published rows scoped to the GUC-selected community; INSERT/UPDATE/DELETE are service-role only (no authenticated write path → no write-scope trigger). Public-facing per-community site content.

export interface RlsTenantTableConfig {
  tableName: string;
  policyFamily: RlsPolicyFamily;
  notes?: string;
}

export interface RlsGlobalTableExclusion {
  tableName: string;
  reason: string;
}

export const RLS_TENANT_TABLES = [
  { tableName: 'announcement_delivery_log', policyFamily: 'service_only' },
  {
    tableName: 'assessments',
    policyFamily: 'tenant_admin_write',
    notes: 'Assessment lifecycle mutations are finance-admin actions. Resident payment flows read generated line items.',
  },
  {
    tableName: 'assessment_line_items',
    policyFamily: 'tenant_admin_write',
    notes: 'Finance service creates recurring and one-off line items; write access remains admin-gated at route layer.',
  },
  {
    tableName: 'rent_obligations',
    policyFamily: 'tenant_admin_write',
    notes: 'Lease-derived monthly obligations; writes are finance-admin actions with tenant-scoped reads.',
  },
  {
    tableName: 'rent_payments',
    policyFamily: 'tenant_admin_write',
    notes: 'Payment journal for rent obligations; write access remains admin-gated in service/route layer.',
  },
  {
    tableName: 'calendar_sync_tokens',
    policyFamily: 'tenant_admin_write',
    notes: 'Calendar sync credentials are scoped per user/community and mutated only through authenticated calendar-sync routes.',
  },
  { tableName: 'calendar_event_reminder_log', policyFamily: 'service_only' },
  {
    tableName: 'accounting_connections',
    policyFamily: 'tenant_admin_write',
    notes: 'Accounting connector credentials and mappings are admin-managed and encrypted at application layer.',
  },
  {
    tableName: 'announcements',
    policyFamily: 'tenant_member_configurable',
    notes: 'Writes configurable per-community via community_settings.announcementsWriteLevel. Default (absent or all_members): any community member may write. admin_only: only admin-tier roles may write. SELECT remains open to all community members.',
  },
  { tableName: 'compliance_audit_log', policyFamily: 'audit_log_restricted' },
  {
    tableName: 'compliance_checklist_items',
    policyFamily: 'tenant_admin_write',
    notes: 'Writes restricted to site_manager/property_manager_admin via requireMutationAuthorization in onboarding routes.',
  },
  {
    tableName: 'contract_bids',
    policyFamily: 'tenant_admin_write',
    notes: 'Writes restricted to ADMIN_ROLES (board_member/board_president/cam/site_manager/property_manager_admin) via requireAdminRole in contracts route.',
  },
  {
    tableName: 'snowbird_digest_subscriptions',
    policyFamily: 'tenant_user_scoped',
    notes: 'Self-service digest cadence/opt-out. A user reads and mutates only their own row (auth.uid()); admin-tier sees all for support. The cron reads cross-tenant via the privileged client.',
  },
  {
    tableName: 'insurance_policies',
    policyFamily: 'tenant_admin_write',
    notes: 'Per-community master-policy summary. SELECT open to community members (owners retrieve it for lender verification); the insurance:read RBAC gate excludes tenants at the route layer. Writes are admin-tier via requirePermission(insurance, write).',
  },
  {
    tableName: 'insurance_certificate_requests',
    policyFamily: 'tenant_user_scoped',
    notes: 'Owner-submitted certificate-request relays. SELECT/UPDATE/DELETE scoped to requested_by = auth.uid() for non-admins; admin-tier sees all. INSERT is community-membership-scoped so owners can create; the route gates on insurance:read + rate-limits.',
  },
  {
    tableName: 'storm_damage_reports',
    policyFamily: 'tenant_user_scoped',
    notes:
      'Post-storm damage intake. Residents file reports about their unit/common areas; a resident reads and mutates only their own rows (reported_by = auth.uid()), admin-tier sees all and updates status. INSERT is community-membership-scoped (pp_tenant_insert) so residents can create. Same posture as insurance_certificate_requests / maintenance_requests. Route gates on storm_damage:read/write + hasStormTools; it is a damage record, NOT an insurance claim (§626.854).',
  },
  {
    tableName: 'wind_mitigation_reports',
    policyFamily: 'tenant_admin_write',
    notes: 'Building-level wind-mitigation inspection records. SELECT open to all community members (owners retrieve the report for their own insurer); writes restricted to ADMIN_ROLES via requirePermission(insurance, write) in the wind-mitigation route.',
  },
  {
    tableName: 'reserve_assets',
    policyFamily: 'tenant_admin_write',
    notes: "Major physical-asset register (reserve transparency, ships dark behind hasReserveTransparency). SELECT open to all community members (owners see the transparent register + remaining-useful-life countdown); writes restricted to admin-tier via requirePermission(reserve_assets, write) in the reserve-assets route. Factual data only — not a reserve study or adequacy assessment.",
  },
  {
    tableName: 'contracts',
    policyFamily: 'tenant_admin_write',
    notes: 'Writes restricted to ADMIN_ROLES (board_member/board_president/cam/site_manager/property_manager_admin) via requireAdminRole in contracts route.',
  },
  { tableName: 'demo_seed_registry', policyFamily: 'service_only' },
  {
    tableName: 'document_categories',
    policyFamily: 'tenant_member_configurable',
    notes: 'Writes configurable via community_settings.documentCategoriesWriteLevel. No standalone write API endpoint exists today; writes occur only through onboarding. admin_only setting allows communities to prevent ad-hoc category creation.',
  },
  {
    tableName: 'documents',
    policyFamily: 'tenant_admin_write',
    notes: 'Writes restricted to ADMIN_ROLES (board_member/board_president/cam/site_manager/property_manager_admin) via requireAdminRole in document routes.',
  },
  {
    tableName: 'invitations',
    policyFamily: 'tenant_admin_write',
    notes: 'Writes restricted to ADMIN_ROLES via requireAdminRole in invitations route.',
  },
  {
    tableName: 'leases',
    policyFamily: 'tenant_member_configurable',
    notes: 'Writes configurable via community_settings.leasesWriteLevel. Apartment-only feature. Communities may restrict lease mutations to admin-tier roles for financial integrity.',
  },
  {
    tableName: 'ledger_entries',
    policyFamily: 'tenant_admin_write',
    notes: 'Writes are expected through postLedgerEntry() and role-gated route handlers; soft-delete enabled for reconciliation workflows.',
  },
  {
    tableName: 'finance_stripe_webhook_events',
    policyFamily: 'tenant_append_only',
    notes: 'Webhook idempotency/event journal for community payment flows; append-only by design.',
  },
  {
    tableName: 'violations',
    policyFamily: 'tenant_crud',
    notes: 'Violation cases are community-scoped. Fine/resolve transitions are RBAC-gated in service and route layers.',
  },
  {
    tableName: 'violation_fines',
    policyFamily: 'tenant_crud',
    notes: 'Fine records remain community-scoped; paid/waived transitions are controlled by workflow rules.',
  },
  {
    tableName: 'arc_submissions',
    policyFamily: 'tenant_crud',
    notes: 'ARC submissions are community-scoped with owner submit and admin review/decide controls at app layer.',
  },
  {
    tableName: 'polls',
    policyFamily: 'tenant_crud',
    notes: 'Poll definitions are community-scoped; role-specific create/close controls are enforced in route/service layers.',
  },
  {
    tableName: 'election_ballot_submissions',
    policyFamily: 'tenant_append_only',
    notes: 'Logical ballot submission headers are immutable once cast and enforce one submission per unit/election.',
  },
  {
    tableName: 'poll_votes',
    policyFamily: 'tenant_user_scoped',
    notes: 'Vote rows are immutable once cast. SELECT/INSERT are constrained to actor rows for non-admin users.',
  },
  {
    tableName: 'forum_threads',
    policyFamily: 'tenant_crud',
    notes: 'Community board threads are tenant-scoped with moderation rules enforced at app layer.',
  },
  {
    tableName: 'forum_replies',
    policyFamily: 'tenant_crud',
    notes: 'Community board replies are tenant-scoped; thread lock/moderation rules are enforced at app layer.',
  },
  {
    tableName: 'vendors',
    policyFamily: 'tenant_crud',
    notes: 'Vendor directory is tenant-scoped; create/update actions are role-gated in API routes.',
  },
  {
    tableName: 'work_orders',
    policyFamily: 'tenant_crud',
    notes: 'Work orders are tenant-scoped; assignment and status transitions are guarded by role checks.',
  },
  {
    tableName: 'amenities',
    policyFamily: 'tenant_crud',
    notes: 'Amenity definitions are tenant-scoped; management actions are restricted to admin roles in app logic.',
  },
  {
    tableName: 'amenity_reservations',
    policyFamily: 'tenant_crud',
    notes: 'Reservations are tenant-scoped; conflict prevention is enforced by a DB exclusion constraint.',
  },
  {
    tableName: 'package_log',
    policyFamily: 'tenant_admin_write',
    notes: 'Package intake/pickup writes are staff-controlled; resident visibility is unit-filtered by route/service logic.',
  },
  {
    tableName: 'visitor_log',
    policyFamily: 'tenant_admin_write',
    notes: 'Visitor check-in/out writes are staff-controlled; resident visibility is host/unit-filtered by route/service logic.',
  },
  {
    tableName: 'maintenance_comments',
    policyFamily: 'tenant_append_only',
    notes: 'Append-only: UPDATE/DELETE dropped at RLS level, consistent with scoped-client APPEND_ONLY_TABLES. INSERT (pp_maintenance_comments_insert) requires the commenter to be authorized to view the associated request: admin-tier or the original submitter (submitted_by_id = auth.uid() on the parent maintenance_request).',
  },
  {
    tableName: 'maintenance_requests',
    policyFamily: 'tenant_user_scoped',
    notes: 'SELECT scoped to own rows for non-admin actors (submitted_by_id = auth.uid()); admin-tier roles see all community requests. UPDATE and DELETE (pp_maintenance_requests_update/delete) are also user-scoped: only the submitter or admin-tier may mutate a request. INSERT retains community-scoped pp_tenant_insert.',
  },
  {
    tableName: 'meeting_documents',
    policyFamily: 'tenant_member_configurable',
    notes: 'Writes configurable via community_settings.meetingDocumentsWriteLevel. Coupled with meetings write-level in practice.',
  },
  {
    tableName: 'meetings',
    policyFamily: 'tenant_member_configurable',
    notes: 'Writes configurable via community_settings.meetingsWriteLevel. Condo/HOA-only feature (apartments excluded by requireMeetingsEnabled()). Communities may restrict meeting management to admin-tier roles.',
  },
  { tableName: 'notification_digest_queue', policyFamily: 'service_only' },
  {
    tableName: 'notification_preferences',
    policyFamily: 'tenant_user_scoped',
    notes: 'All four operations scoped to own rows (user_id = auth.uid()) for non-privileged actors. SELECT and UPDATE (pp_notification_preferences_select/update) were hardened in 0025. INSERT and DELETE (pp_notification_preferences_insert/delete) hardened in 0026 to prevent IDOR. Admin-tier roles retain full access via pp_rls_is_privileged() / pp_rls_can_read_audit_log().',
  },
  {
    tableName: 'onboarding_wizard_state',
    policyFamily: 'tenant_admin_write',
    notes: 'Community-shared wizard state: a single row per (community, wizardType) shared across all admins. All writes (INSERT/UPDATE/DELETE) restricted to admin-tier roles (pp_rls_can_read_audit_log) at the DB layer, hardened in 0026. SELECT remains open to all community members (pp_tenant_select).',
  },
  { tableName: 'provisioning_jobs', policyFamily: 'service_only' },
  {
    tableName: 'stripe_connected_accounts',
    policyFamily: 'tenant_admin_write',
    notes: 'Connect account lifecycle is managed by finance admins only.',
  },
  {
    tableName: 'units',
    policyFamily: 'tenant_member_configurable',
    notes: 'Writes configurable via community_settings.unitsWriteLevel. Units are community inventory; communities may restrict creation/modification to admin-tier roles.',
  },
  {
    tableName: 'user_roles',
    policyFamily: 'tenant_admin_write',
    notes: 'INSERT/UPDATE/DELETE require admin-tier role (pp_rls_can_read_audit_log). SELECT uses community membership. No recursion risk: pp_rls_has_community_membership is SECURITY DEFINER.',
  },
  {
    tableName: 'esign_templates',
    policyFamily: 'tenant_admin_write',
    notes: 'E-signature templates are managed by admin-tier roles only. SELECT open to community members.',
  },
  {
    tableName: 'esign_submissions',
    policyFamily: 'tenant_admin_write',
    notes: 'E-signature submission lifecycle (create, send, void) is admin-managed. SELECT open to community members.',
  },
  {
    tableName: 'esign_signers',
    policyFamily: 'tenant_admin_write',
    notes: 'Signer rows are derived from submissions; mutated only by admin-tier roles.',
  },
  {
    tableName: 'esign_events',
    policyFamily: 'tenant_append_only',
    notes: 'Immutable audit trail of e-signature lifecycle events. INSERT only; no UPDATE/DELETE.',
  },
  {
    tableName: 'esign_consent',
    policyFamily: 'tenant_user_scoped',
    notes: 'UETA/ESIGN Act consent tracking. Users manage their own consent; admin-tier sees all.',
  },
  { tableName: 'support_consent_grants', policyFamily: 'service_only' },
  { tableName: 'support_access_log', policyFamily: 'audit_log_restricted' },
  {
    tableName: 'access_requests',
    policyFamily: 'tenant_crud',
    notes:
      'Self-service resident signup with OTP verification. RLS hardened in 0021 to use pp_rls_can_access_community(community_id) and the canonical pp_rls_enforce_tenant_scope trigger; the baseline policies referenced the wrong GUC (app.community_id) and never installed a write-scope trigger.',
  },
  {
    tableName: 'community_join_requests',
    policyFamily: 'tenant_crud',
    notes:
      'Self-service community linking: users submit a request to join a community, admins approve/deny. RLS hardened in 0021 (same GUC + missing-trigger drift fix as access_requests).',
  },
  {
    tableName: 'onboarding_checklist_items',
    policyFamily: 'tenant_user_scoped',
    notes:
      'Per-user onboarding progress. Baseline policies (checklist_items_{insert,select,update}_own) gate on community_id = GUC AND user_id = auth.uid(); wrong-GUC drift repaired in 0023. No DELETE policy (rows soft-deleted via UPDATE by onboarding-checklist-service; authenticated hard-delete fails closed). Bespoke policy names retained — see the per-table override in rls-policies.integration.test.ts. Legacy write-scope trigger canonicalized to pp_rls_enforce_tenant_scope in 0024. Runtime uses createScopedClient (privileged role) so RLS here is defense-in-depth.',
  },
  {
    tableName: 'site_blocks',
    policyFamily: 'public_read_service_write',
    notes:
      'Public per-community site content. anon + authenticated SELECT expose only published (is_draft=false) rows of the GUC-selected community (site_blocks_anon_read / site_blocks_read_published); all writes are service-role only (site_blocks_service_role). Wrong-GUC drift repaired in 0023. No write-scope trigger — there is no authenticated write path (trigger-exempt family). Bespoke policy names retained — see the per-table override in rls-policies.integration.test.ts. Runtime reads via createUnscopedClient (public-community-reader) so RLS here is defense-in-depth for direct anon/authenticated access.',
  },
  {
    tableName: 'site_publish_snapshots',
    policyFamily: 'service_only',
    notes:
      'Publish history for the public site (website editor v3, Phase 6). Deliberately NOT the public_read_service_write family its sibling site_blocks uses: the `snapshot` column holds the full block payload of a PAST publish, so an anon read would expose site content the association may since have deliberately taken down. All ops require pp_rls_is_privileged() (single pp_site_publish_snapshots_service policy, 0034) — admin access to the history list is authorized at the ROUTE, not by RLS, and the list response omits `snapshot` entirely. Trigger-exempt for the same reason site_blocks is: captureSnapshot writes inside publishCommunitySite\'s service-role transaction, so there is no authenticated write path for pp_rls_enforce_tenant_community_id() to police. `snapshot` is nullable and pruned by the retention sweep; the log row persists indefinitely.',
  },
  // ---------------------------------------------------------------------------
  // Registered 2026-07-26. These fifteen tables have a community_id and RLS
  // enabled in production, but had never been listed here — so
  // validateRlsConfigInvariant(), the family policy-name loop and the trigger
  // loop all skipped them for their entire lives. Classification below is from
  // the actual CREATE POLICY statements in migrations 0000 / 0019, not guessed.
  // Most predate the pp_* naming convention and carry per-table entries in
  // `expectedPolicyOverrides` (rls-policies.integration.test.ts) recording that
  // only the NAME diverges, never the shape.
  // ---------------------------------------------------------------------------
  {
    tableName: 'denied_visitors',
    policyFamily: 'tenant_admin_write',
    notes:
      'Visitor deny-list. SELECT on community membership (denied_visitors_select); INSERT/UPDATE/DELETE additionally require pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id), i.e. admin-tier. Baseline policy names (denied_visitors_*) predate the pp_ convention — override entry in the suite. NOTE: anon/authenticated are REVOKED on this table (0035, codifying production), so these policies are defence-in-depth for direct access; the app reads it through createScopedClient under a privileged role (package-visitor-service.ts). Deliberately NOT service_only despite the revoke — that family behaviourally asserts authenticated SELECT returns zero rows rather than a permission error, which a revoked table cannot satisfy.',
  },
  {
    tableName: 'document_drafts',
    policyFamily: 'tenant_crud',
    notes:
      'Authored-document drafts. Four membership-scoped policies (document_drafts_community_{read,insert,update,delete}) on pp_rls_can_access_community(community_id), plus an explicit document_drafts_service_bypass FOR ALL on pp_rls_is_privileged(). Baseline names; write-scope trigger present under the legacy name document_drafts_tenant_scope. The UPDATE policy has USING but no WITH CHECK — the trigger is what stops a row being moved out of its community.',
  },
  {
    tableName: 'faqs',
    policyFamily: 'tenant_crud',
    notes:
      'Per-community FAQ entries. Same baseline shape as document_drafts: faqs_community_{read,insert,update,delete} on pp_rls_can_access_community(community_id) plus faqs_service_bypass FOR ALL. Legacy trigger name faqs_tenant_scope.',
  },
  {
    tableName: 'help_article_feedback',
    policyFamily: 'tenant_crud',
    notes:
      'Was-this-helpful votes on MDX help articles. Same baseline shape: help_article_feedback_community_{read,insert,update,delete} plus a service bypass. Legacy trigger name help_article_feedback_tenant_scope.',
  },
  {
    tableName: 'help_article_views',
    policyFamily: 'tenant_append_only',
    notes:
      'View counter for help articles. Only INSERT and SELECT policies exist (help_article_views_community_{insert,read}) plus a service bypass — no UPDATE or DELETE policy, so authenticated mutation fails closed. That is the append-only posture, reached by omission rather than by an explicit drop. Bespoke names, so an override entry rather than the family default pp_help_article_views_insert / pp_tenant_select. Carries a legacy-named write-scope trigger even though the family is trigger-exempt.',
  },
  {
    tableName: 'move_checklists',
    policyFamily: 'tenant_crud',
    notes:
      'Move-in/move-out checklists. Same baseline shape: move_checklists_community_{read,insert,update,delete} plus a service bypass. Legacy trigger name move_checklists_tenant_scope.',
  },
  {
    tableName: 'elections',
    policyFamily: 'tenant_admin_write',
    notes:
      'Election definitions (§718.128). SELECT open to community members (pp_tenant_select); INSERT/UPDATE/DELETE require pp_rls_can_read_audit_log(community_id). Policy names carry an _admin_ infix (pp_elections_admin_insert) where the family default expects pp_elections_insert — name-only divergence, override entry in the suite. Canonical pp_rls_enforce_tenant_scope trigger.',
  },
  {
    tableName: 'election_candidates',
    policyFamily: 'tenant_admin_write',
    notes:
      'Candidate roster for an election. Identical shape and identical _admin_ infix divergence as elections. Canonical trigger.',
  },
  {
    tableName: 'election_ballots',
    policyFamily: 'tenant_append_only',
    notes:
      'Cast ballots — immutable once submitted (no updatedAt, no deletedAt on the table). pp_election_ballots_insert + pp_tenant_select match the family default exactly, so no override entry is needed. Trigger is INSERT-only, consistent with the family being trigger-exempt.',
  },
  {
    tableName: 'election_eligibility_snapshots',
    policyFamily: 'tenant_append_only',
    notes:
      'Point-in-time voter-eligibility snapshot per election; immutable by design. INSERT policy is named pp_election_eligibility_insert — the table name truncated — where the family default expects pp_election_eligibility_snapshots_insert. Name-only divergence, override entry in the suite.',
  },
  {
    tableName: 'election_proxies',
    policyFamily: 'tenant_crud',
    notes:
      'Proxy designations for election voting (§718.128 proxy support). Uses the canonical pp_tenant_{select,insert,update,delete} set verbatim, so no override entry is needed. Canonical trigger.',
  },
  {
    tableName: 'emergency_broadcasts',
    policyFamily: 'tenant_crud',
    notes:
      'Emergency broadcast messages. Four policies (pp_emergency_broadcasts_{select,insert,update,delete}) sharing one predicate: pp_rls_is_privileged() OR (auth.uid() IS NOT NULL AND pp_rls_can_access_community(community_id)) — the membership check with an explicit not-anon guard, so equivalent to tenant_crud for any authenticated caller. Bespoke names, so an override entry. Had no write-scope trigger of any name until 0037, which installed the canonical pp_rls_enforce_tenant_scope: the WITH CHECK alone only rejects a community_id the caller cannot access, so a member of two communities could write into whichever they named regardless of the resolved tenant context. The trigger rewrites it instead.',
  },
  {
    tableName: 'emergency_broadcast_recipients',
    policyFamily: 'tenant_crud',
    notes:
      'Per-recipient delivery rows for an emergency broadcast. Identical policy shape to emergency_broadcasts, and the same missing write-scope trigger — both closed by 0037.',
  },
  {
    tableName: 'notifications',
    policyFamily: 'tenant_user_scoped',
    notes:
      'In-app notification inbox. Only two policies exist — notifications_user_select and notifications_user_update — both gated purely on user_id = auth.uid(). They never reference community_id: strictly narrower than a membership check (a user only ever reads their own rows regardless of tenant), so this is not a cross-tenant leak, but it is off-idiom for the family. No INSERT or DELETE policy, so authenticated writes fail closed; notifications are created by the service role. Write-scope trigger present under the legacy name notifications_enforce_tenant_scope.',
  },
  {
    tableName: 'root_claim_disputes',
    policyFamily: 'audit_log_restricted',
    notes:
      'Disputes raised against a root-manager claim (0019). Not a log by name, but an exact behavioural match for the family definition: SELECT requires admin-tier (pp_root_claim_disputes_select on pp_rls_can_read_audit_log(community_id)), INSERT requires privilege (pp_root_claim_disputes_insert WITH CHECK pp_rls_is_privileged()), and there is no UPDATE or DELETE policy — the record is immutable once filed. Bespoke names, so an override entry. Carries a canonical trigger even though the family is trigger-exempt.',
  },
] as const satisfies readonly RlsTenantTableConfig[];

export const RLS_GLOBAL_TABLE_EXCLUSIONS = [
  { tableName: 'communities', reason: 'Root tenant entity — isolation enforced on id column (not community_id) by ScopedClient special-case; RLS is enabled (pp_communities_* policies, 0026) but community_id FK-based scoping does not apply' },
  { tableName: 'users', reason: 'Global identity mirror (no community_id column)' },
  { tableName: 'pending_signups', reason: 'Pre-provisioning flow, not community-scoped yet' },
  { tableName: 'stripe_webhook_events', reason: 'Global billing webhook log' },
  { tableName: 'platform_admin_users', reason: 'Platform-level admin authorization — service_role only (REVOKE ALL from anon/authenticated). No community_id column; not community-scoped.' },
  { tableName: 'access_plans', reason: 'Platform-level access management — not community-scoped. Managed by super_admin only.' },
  { tableName: 'account_deletion_requests', reason: 'Platform-level deletion workflow — not community-scoped. Cross-community visibility required for admin dashboard.' },
  { tableName: 'support_sessions', reason: 'Platform-level support session tracking — service_role only. Admin-created sessions reference communities but are not tenant-scoped.' },
  { tableName: 'stripe_prices', reason: 'Billing configuration — global, not community-scoped. Managed by platform ops.' },
  { tableName: 'conversion_events', reason: 'Analytics table — must survive demo soft-deletion and community conversion lifecycle. Not tenant-scoped because events span the demo→paid transition.' },
  { tableName: 'public_site_templates', reason: 'Platform-level public site template library for demos. Managed by platform admins and consumed through service-role admin APIs.' },
  // ---------------------------------------------------------------------------
  // Registered 2026-07-26 alongside the fifteen tenant tables above. None of
  // these has a community_id column, so community_id FK-based scoping does not
  // apply to any of them. Verified against the migrations, not assumed.
  // ---------------------------------------------------------------------------
  { tableName: 'billing_groups', reason: 'Cross-community billing rollup keyed on owner_user_id, not community_id — one group can span several communities, which is the point of it. RLS enabled: billing_groups_owner_read (SELECT where owner_user_id = auth.uid()) plus billing_groups_service_write (FOR ALL). Off-idiom in one respect: the service policy tests auth.role() = \'service_role\' directly rather than pp_rls_is_privileged() like every other table here.' },
  { tableName: 'demo_instances', reason: 'Platform demo-provisioning ledger — references a seeded_community_id but is not scoped by it (a row can outlive the community it seeded). RLS is enabled with ZERO policies, which denies every non-privileged caller outright; access is service-role only. Enabled without FORCE, unlike the tenant tables.' },
  { tableName: 'revenue_snapshots', reason: 'Platform-level revenue aggregates across all communities (by_community_type is a jsonb rollup, not a scoping column). RLS enabled with zero policies, plus REVOKE ALL from anon/authenticated (0035). Service-role only.' },
  { tableName: 'site_layout_metadata', reason: 'Platform-level layout catalogue for the public-site editor. Not community-scoped. RLS enabled with zero policies, plus REVOKE ALL from anon/authenticated (0005).' },
  { tableName: 'site_starter_packs', reason: 'Platform-level starter content packs for the public-site editor, keyed by community_type (a category, not a tenant). RLS enabled with zero policies, plus REVOKE ALL from anon/authenticated (0005).' },
  { tableName: 'site_theme_presets', reason: 'Platform-level theme preset library for the public-site editor. Not community-scoped. RLS enabled with zero policies, plus REVOKE ALL from anon/authenticated (0005).' },
  { tableName: 'site_portfolio_templates', reason: 'Per-user saved portfolio templates for property managers — scoped on owner_user_id, not community_id, so one template is reusable across the manager\'s whole portfolio. Four own-row policies (site_portfolio_templates_{select,insert,update,delete}_own) on owner_user_id = auth.uid() (0013). Enabled without FORCE.' },
  { tableName: 'user_preferences', reason: 'Per-user application preferences (theme, density) that deliberately span communities — a user gets one set, not one per tenant. Four own-row policies on user_id = auth.uid() (0011). Enabled without FORCE.' },
  {
    tableName: 'user_search_index',
    reason:
      'Global cross-community user search index (no community_id), so tenant scoping does not apply. Held full_name and email (both trigram-indexed) with NO row-level security of any kind until 0037 — no ENABLE, no policies, no REVOKE — which under Supabase\'s open grant baseline left it directly readable by anon and authenticated, and was the table behind Supabase\'s "RLS Disabled in Public" advisor entry. 0037 gives it the same posture as the seven sibling platform tables: RLS enabled and forced, zero policies (the deny-everyone default), and REVOKE ALL from anon/authenticated with service_role retaining CRUD. The sole runtime reader (packages/db/src/queries/trigram-search.ts) goes over the privileged connection and is unaffected.',
  },
] as const satisfies readonly RlsGlobalTableExclusion[];

export const RLS_TENANT_TABLE_NAMES = RLS_TENANT_TABLES.map((entry) => entry.tableName);
export const RLS_GLOBAL_EXCLUSION_NAMES = RLS_GLOBAL_TABLE_EXCLUSIONS.map(
  (entry) => entry.tableName,
);

// Hardcoded intentionally — if you add or remove a table from RLS_TENANT_TABLES,
// you MUST update this number. This makes validateRlsConfigInvariant() a real
// regression guard rather than a tautology.
//
// WHY NOT derive this dynamically from RLS_TENANT_TABLES.length?
// A dynamic check (expected === actual === length) would always pass trivially
// and would never catch accidental additions or removals — it would be comparing
// the array to itself. The hardcoded constant forces a human to consciously
// acknowledge the change, which is the entire point of the guard.
// 60 on main + onboarding_checklist_items + site_blocks = 62. This PR was
// authored when the count was 54 (→56); the true total must be re-derived at
// merge time because parallel PRs each bump +1 and git merges both silently.
// 62 on main + site_publish_snapshots (0034) = 63. RE-DERIVE THIS AT MERGE:
// parallel PRs each bump +1 and git merges both silently, so the second PR to
// merge has to set the true total rather than trusting this number.
// 63 on main + the fifteen tables registered 2026-07-26 = 78. That, plus the 20
// global exclusions, now accounts for all 98 tables in public — which is the
// invariant the drift-guard test in rls-policies.integration.test.ts enforces,
// so an unregistered table can no longer go unnoticed. SAME RE-DERIVE WARNING
// APPLIES: this jumped by 15, so a parallel +1 will silently merge on top of it.
export const RLS_EXPECTED_TENANT_TABLE_COUNT = 78;

export type RlsTenantTableName = (typeof RLS_TENANT_TABLES)[number]['tableName'];
export type RlsGlobalExclusionName = (typeof RLS_GLOBAL_TABLE_EXCLUSIONS)[number]['tableName'];

export function validateRlsConfigInvariant(): string[] {
  const problems: string[] = [];

  if (RLS_TENANT_TABLE_NAMES.length !== RLS_EXPECTED_TENANT_TABLE_COUNT) {
    problems.push(
      `Expected ${RLS_EXPECTED_TENANT_TABLE_COUNT} tenant-scoped tables, found ${RLS_TENANT_TABLE_NAMES.length}`,
    );
  }

  const tenantSet = new Set<string>();
  for (const tableName of RLS_TENANT_TABLE_NAMES) {
    if (tenantSet.has(tableName)) {
      problems.push(`Duplicate tenant table entry: ${tableName}`);
    }
    tenantSet.add(tableName);
  }

  const globalSet = new Set<string>();
  for (const tableName of RLS_GLOBAL_EXCLUSION_NAMES) {
    if (globalSet.has(tableName)) {
      problems.push(`Duplicate global exclusion entry: ${tableName}`);
    }
    globalSet.add(tableName);
    if (tenantSet.has(tableName)) {
      problems.push(`Table appears in both tenant RLS list and global exclusions: ${tableName}`);
    }
  }

  return problems;
}

export function isTenantScopedRlsTable(tableName: string): tableName is RlsTenantTableName {
  return RLS_TENANT_TABLE_NAMES.includes(tableName as RlsTenantTableName);
}
