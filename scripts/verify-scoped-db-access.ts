import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

type RuleCode = 'DB001' | 'DB002' | 'DB003' | 'DB004' | 'DB005';
type GuardMode = 'scoped' | 'admin';

interface Violation {
  file: string;
  line: number;
  column: number;
  code: RuleCode;
  message: string;
}

interface AppGuardConfig {
  appDir: string;
  mode: GuardMode;
  unsafeAllowlist: Set<string>;
  /**
   * Populated during the scan with allowlisted files that actually import an
   * unsafe/admin specifier. Any `unsafeAllowlist` entry NOT in here after the
   * scan is a dead allowlist entry (file deleted, or it no longer reaches for
   * the unsafe client) and is reported so the ledger stays honest (DBB-03).
   */
  usedUnsafe?: Set<string>;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const migrationsRoot = join(repoRoot, 'packages', 'db', 'migrations');

const ALLOWED_DB_SUBPATHS = new Set<string>([
  '@propertypro/db/supabase/client',
  '@propertypro/db/supabase/server',
  '@propertypro/db/supabase/admin',
  '@propertypro/db/supabase/admin-types',
  '@propertypro/db/supabase/middleware',
  '@propertypro/db/constants',
  '@propertypro/db/filters',
  '@propertypro/db/unsafe',
  '@propertypro/db/seed/seed-community',
  '@propertypro/db/supabase/cookie-config',
]);

const WEB_UNSAFE_IMPORT_ALLOWLIST = new Set<string>([
  // Dev-only: reset onboarding wizard state for E2E testing (gated by NODE_ENV)
  resolve(repoRoot, 'apps/web/src/app/dev/reset-onboarding/route.ts'),
  resolve(repoRoot, 'apps/web/src/lib/tenant/community-resolution.ts'),
  resolve(repoRoot, 'apps/web/src/lib/services/notification-digest-processor.ts'),
  resolve(repoRoot, 'apps/web/src/lib/auth/signup.ts'),
  // Phase 1A: Assessment automation cron — cross-community overdue/late-fee processing
  resolve(repoRoot, 'apps/web/src/lib/services/assessment-automation-service.ts'),
  // Calendar reminder cron — cross-community reminder enqueue + delivery
  resolve(repoRoot, 'apps/web/src/lib/services/calendar-event-reminder-service.ts'),
  // Compliance alert cron — cross-community overdue scanning
  resolve(repoRoot, 'apps/web/src/lib/services/compliance-alert-service.ts'),
  // P2-34: Stripe integration — pre-tenant context, no communityId available
  resolve(repoRoot, 'apps/web/src/lib/services/stripe-service.ts'),
  resolve(repoRoot, 'apps/web/src/lib/services/stripe-webhook-service.ts'),
  resolve(repoRoot, 'apps/web/src/lib/actions/checkout.ts'),
  // P2-34a: Payment reminders + subscription guard — cross-community cron + mutation guard
  resolve(repoRoot, 'apps/web/src/lib/services/payment-alert-scheduler.ts'),
  resolve(repoRoot, 'apps/web/src/lib/middleware/subscription-guard.ts'),
  // Lapsed-state admin read gating — reads the root communities row by PK to
  // derive lifecycle state (same rationale as subscription-guard.ts).
  resolve(repoRoot, 'apps/web/src/lib/middleware/read-entitlement-guard.ts'),
  // B-01: Plan-to-feature gating — cross-community plan lookup for feature guard
  resolve(repoRoot, 'apps/web/src/lib/middleware/plan-guard.ts'),
  resolve(repoRoot, 'apps/web/src/app/(authenticated)/billing/portal/route.ts'),
  // P3-PRE-03: PM portfolio cross-community read boundary
  resolve(repoRoot, 'apps/web/src/lib/api/pm-communities.ts'),
  // P3-PRE-03: PM community creation — root tenant table bootstrap, no communityId available yet
  resolve(repoRoot, 'apps/web/src/lib/pm/create-community.ts'),
  // P2-35: Provisioning pipeline — cross-tenant bootstrap, no communityId at start
  resolve(repoRoot, 'apps/web/src/lib/services/provisioning-service.ts'),
  // Provisioning status polling — pre-login endpoint, queries provisioning_jobs + pending_signups.
  // The unsafe-client usage moved into provisioning-service in A3 Phase 2,
  // so the route itself no longer needs the allowance.
  // P3-47: White-label branding — communities is the root tenant table (no communityId column);
  // getBrandingForCommunity must query by primary key directly.
  resolve(repoRoot, 'apps/web/src/lib/api/branding.ts'),
  // Custom domain — communities is the root tenant table (no community_id column);
  // the service reads/writes custom_domain* columns by primary key directly.
  // Caller authorization (management-tier property_manager/root_manager membership + hasSiteCustomDomain plan) is
  // verified upstream at the route layer.
  resolve(repoRoot, 'apps/web/src/lib/services/custom-domain-service.ts'),
  // Portfolio templates — site_portfolio_templates is user-owned (no community_id
  // column), keyed by owner_user_id with RLS via auth.uid(); the access-gate joins
  // user_roles → communities (root tenant table). Caller authz (management-tier
  // property_manager/root_manager + hasSitePortfolioTemplates plan) is verified upstream at the route layer.
  resolve(repoRoot, 'apps/web/src/lib/services/site-portfolio-template-service.ts'),
  // JSX site template — public site queries published template by community_id (root tenant key)
  // P4-64: Community data export — residents export joins users table (no community_id column)
  resolve(repoRoot, 'apps/web/src/lib/services/community-export.ts'),
  // Operations reservation cancel transition — atomic transaction uses the unsafe escape hatch
  // after the caller has already verified tenant membership and reservation ownership scope.
  resolve(repoRoot, 'apps/web/src/lib/services/work-orders-service.ts'),
  // Elections vote/proxy/state transitions require one transaction for domain rows and audit rows.
  resolve(repoRoot, 'apps/web/src/lib/services/elections-service.ts'),
  // PR #8a: site-blocks atomic publish + transactional upserts.
  // publishCommunitySite runs a single transaction (SELECT FOR UPDATE on
  // communities → soft-delete published → promote drafts → audit log) per
  // spec §2.7. upsertPublishedBlock also wraps its soft-delete + insert in
  // a transaction. Both require createUnscopedClient().transaction().
  // Caller authorization is verified upstream at the route layer (management-tier
  // property_manager/root_manager membership + hasSiteEditor plan feature).
  resolve(repoRoot, 'apps/web/src/lib/services/site-blocks-service.ts'),
  // Community-scoped user display-name resolution for board/forum and elections UX
  resolve(repoRoot, 'apps/web/src/lib/utils/resolve-users.ts'),
  // Community picker — cross-community user membership query for post-login routing
  resolve(repoRoot, 'apps/web/src/lib/api/user-communities.ts'),
  // Cross-community query helpers — unified owner dashboard + aggregated notifications.
  // User is the authorization anchor; callers MUST resolve the user's authorized community
  // ids via getAuthorizedCommunityIds() and then run scoped queries per community.
  resolve(repoRoot, 'apps/web/src/lib/queries/cross-community.ts'),
  // Cross-community notifications — aggregated feed across all communities the user belongs to.
  resolve(repoRoot, 'apps/web/src/app/api/v1/notifications/all/route.ts'),
  // Invitation acceptance — creates Supabase auth user via admin client (service_role)
  resolve(repoRoot, 'apps/web/src/lib/services/invitations-service.ts'),
  // Task 2.4-2.6: Demo auto-auth — looks up demo_instances (service_role) and creates session.
  // The unsafe-client usage moved into demo-conversion service in A3 Phase 2,
  // so the route itself no longer needs the allowance.
  // Transparency public route: slug resolution and opt-in lookup before tenant scoping
  resolve(repoRoot, 'apps/web/src/app/api/v1/transparency/route.ts'),
  // Host-native transparency renderer: community resolved via middleware x-community-id header
  resolve(repoRoot, 'apps/web/src/app/public-transparency/page.tsx'),
  // Dev auto-login — resolves user's community for /mobile redirect (dev-only, 404 in production)
  resolve(repoRoot, 'apps/web/src/app/dev/login/route.ts'),
  // Dev agent-login — password-based login for agents (dev-only, 404 in production)
  resolve(repoRoot, 'apps/web/src/app/dev/agent-login/route.ts'),
  // Dev reset-onboarding — resets community onboarding state (dev-only, 404 in production)
  resolve(repoRoot, 'apps/web/src/app/dev/reset-onboarding/route.ts'),
  // O-01: Email verification confirmation — pre-tenant state, checks Supabase auth via admin.
  // The unsafe-client + auth-admin usage moved into provisioning-service in
  // A3 Phase 2, so the route itself no longer needs the allowance.
  // Resend signup verification email — pre-tenant state, looks up pendingSignups row.
  // The unsafe-client + auth-admin usage moved into provisioning-service in
  // A3 Phase 2, so the route itself no longer needs the allowance.
  // E-02: Account profile — user-scoped update (no community_id on users table).
  // The unsafe-client usage moved into the user-profile-service in A3 Phase 2,
  // so the route itself no longer needs the allowance.
  resolve(repoRoot, 'apps/web/src/lib/services/user-profile-service.ts'),
  // User preferences — per-user platform-level key/value (no community_id);
  // caller authorizes on user identity and only touches the actor's own rows.
  resolve(repoRoot, 'apps/web/src/lib/services/user-preferences-service.ts'),
  // E-02: Account settings page — reads user row (no community_id on users table)
  resolve(repoRoot, 'apps/web/src/app/(authenticated)/settings/account/page.tsx'),
  // Phase 1B: Phone OTP verification — queries/updates users table (no community_id column).
  // The unsafe-client usage moved into the phone-verification-service in A3 Phase 2,
  // so the routes themselves no longer need the allowance.
  resolve(repoRoot, 'apps/web/src/lib/services/phone-verification-service.ts'),
  // Phase 1B: Twilio webhook — cross-tenant SID lookup (no community_id from webhook).
  // The unsafe-client usage moved into the twilio-webhook-service in A3 Phase 2,
  // so the route itself no longer needs the allowance.
  resolve(repoRoot, 'apps/web/src/lib/services/twilio-webhook-service.ts'),
  // Phase 2C: PM dashboard — cross-community KPI aggregation + report queries
  resolve(repoRoot, 'apps/web/src/app/api/v1/pm/dashboard/summary/route.ts'),
  resolve(repoRoot, 'apps/web/src/app/api/v1/pm/reports/[reportType]/route.ts'),
  // Phase 2C: Bulk operations — cross-community announcements + document uploads
  resolve(repoRoot, 'apps/web/src/app/api/v1/pm/bulk/announcements/route.ts'),
  resolve(repoRoot, 'apps/web/src/app/api/v1/pm/bulk/documents/route.ts'),
  // Phase 2C: Branding settings — communities is root tenant table
  // Conversion event emission — global analytics table, not community-scoped
  resolve(repoRoot, 'apps/web/src/lib/services/conversion-events.ts'),
  // Readiness check — global stripe_prices + DB connectivity (no community context)
  resolve(repoRoot, 'apps/web/src/lib/services/readiness-service.ts'),
  // Demo info detection — queries demo_instances joined with communities (cross-tenant lookup)
  resolve(repoRoot, 'apps/web/src/lib/demo/detect-demo-info.ts'),
  // Demo lifecycle: landing page, entry, conversion, expiry cron, session helper
  resolve(repoRoot, 'apps/web/src/app/demo/[slug]/page.tsx'),
  resolve(repoRoot, 'apps/web/src/app/demo/[slug]/upgrade/page.tsx'),
  resolve(repoRoot, 'apps/web/src/app/demo/[slug]/converted/page.tsx'),
  // Demo grace period guard — queries communities table (global, no community_id scoping)
  resolve(repoRoot, 'apps/web/src/lib/middleware/demo-grace-guard.ts'),
  resolve(repoRoot, 'apps/web/src/lib/services/demo-session.ts'),
  resolve(repoRoot, 'apps/web/src/lib/services/demo-conversion.ts'),
  // U-06: Access request service — pre-tenant OTP verification before communityId is scoped
  resolve(repoRoot, 'apps/web/src/lib/services/access-request-service.ts'),
  // Public e-sign links are authorized by possession of submissionExternalId + signer slug
  // and must resolve across tenants before any community context exists.
  resolve(repoRoot, 'apps/web/src/lib/services/esign-service.ts'),
  // Account lifecycle: platform-level access plans + deletion workflows (no community_id scoping)
  resolve(repoRoot, 'apps/web/src/lib/services/account-lifecycle-service.ts'),
  // Root-offboarding: cross-community read of the caller's own root_manager memberships
  // to flag rootless-on-deletion (role-v3 Phase 2a). Unscoped by nature — root_manager spans communities.
  resolve(repoRoot, 'apps/web/src/lib/account-lifecycle/root-offboarding.ts'),
  // Claim-root service: resolves the caller's own rootless property_manager
  // memberships (findMyRootlessCommunities) to drive the claim/claim-all flow
  // (role-v3 Phase 2b). Cross-community by nature — self-scoped to the session user.
  resolve(repoRoot, 'apps/web/src/lib/services/claim-root-service.ts'),
  // Claim-root notify: cross-community lookup of the other PM/root recipients to
  // notify on a root claim (role-v3 Phase 2b). Self-excludes the claimant.
  resolve(repoRoot, 'apps/web/src/lib/services/claim-root-notify.ts'),
  // Root-dispute service: transferRoot/reassignRoot swap two userRoles rows
  // atomically via the unscoped transaction client (createUnscopedClient) under
  // the one-root partial unique index (role-v3 Phase 2b). Self-authorized by the
  // route handlers (root-identity / platform-admin gates).
  resolve(repoRoot, 'apps/web/src/lib/services/root-dispute-service.ts'),
  // my-rootless route: GET read source for the claim banner/screen. Calls
  // findMyRootlessCommunities (cross-community) self-scoped to the authenticated
  // session user (role-v3 Phase 2b).
  resolve(repoRoot, 'apps/web/src/app/api/v1/communities/my-rootless/route.ts'),
  // Platform admin auth guard — queries platform_admin_users (no community_id)
  resolve(repoRoot, 'apps/web/src/lib/api/require-platform-admin.ts'),
  // Admin access-plans routes — platform-level CRUD on access_plans table
  // Admin deletion-requests routes — platform-level deletion workflow management
  // User-facing deletion routes — cross-community deletion workflows
  // Subscribe route — Stripe checkout + access plan conversion
  // Change-plan route — Stripe subscription update for in-app upgrades
  // Account lifecycle cron — cross-community deletion + notification processing
  // Coupon sync retry cron — billing group tier recalculation and Stripe discount sync
  // Visitor auto-checkout cron — cross-community cleanup of overdue checked-in visitor passes
  resolve(repoRoot, 'apps/web/src/lib/services/visitor-cron-service.ts'),
  // Support access consent — uses createAdminClient for cross-community consent/log queries
  resolve(repoRoot, 'apps/web/src/app/api/v1/settings/support-access/route.ts'),
  // Support impersonation middleware — validates active support sessions with service-role access
  resolve(repoRoot, 'apps/web/src/lib/support/impersonation.ts'),
  // Auth helper hydrates the effective support-session actor from the users table
  resolve(repoRoot, 'apps/web/src/lib/api/auth.ts'),
  // Billing groups are owner-scoped (PM-level), not community-scoped — no communityId available
  resolve(repoRoot, 'apps/web/src/lib/billing/billing-group-service.ts'),
  // Downgrade notifications — queries communities and admins in a billing group for notification dispatch
  resolve(repoRoot, 'apps/web/src/lib/billing/downgrade-notifications.ts'),
  // Pricing preview — queries all communities in a billing group; authorized by billing group ownership
  // Cancel preview — queries communities in a billing group; authorized by billing group ownership
  // Community cancel — soft-deletes community + triggers tier recalc; authorized by billing group ownership
  // Self-service community linking: pre-tenant eligibility checks + cross-community lookups
  // authorization contract: caller authenticates userId before invoking these helpers
  resolve(repoRoot, 'apps/web/src/lib/join-requests/eligibility.ts'),
  resolve(repoRoot, 'apps/web/src/lib/join-requests/approve-request.ts'),
  // Public community search: discovery endpoint intentionally queries across all communities,
  // returns only minimal non-sensitive metadata (name, city, state, type, rounded member count)
  resolve(repoRoot, 'apps/web/src/lib/services/community-search-service.ts'),
  // Authenticated user's own join requests (own-user scoped, no community context yet)
  // Admin approve/deny endpoints: cross-community service dispatched after permission check
  // Revenue snapshot cron + health — platform-wide metrics, not tenant-scoped
  resolve(repoRoot, 'apps/web/src/lib/services/revenue-snapshot-data-service.ts'),
  // PR #1a: Public-site community reader — unauthenticated /_site context, no TenantContext
  // available. Applies explicit community_id + deletedAt predicates on every read.
  resolve(repoRoot, 'apps/web/src/lib/db/public-community-reader.ts'),
  // Snowbird digest cron — by-design cross-tenant scan of communities with the
  // digest enabled; per-community reads then use a scoped client. Same posture
  // as notification-digest-processor.
  resolve(repoRoot, 'apps/web/src/lib/services/snowbird-digest-processor.ts'),
  // Snowbird digest no-login unsubscribe write — token-authenticated, no session
  // to establish tenant context; the signed token confines the write to the
  // exact (communityId, userId) it encodes.
  resolve(repoRoot, 'apps/web/src/lib/services/snowbird-digest-unsubscribe-service.ts'),
  // Insurance-alerts cron — by-design cross-tenant scan of insurance-hub
  // communities; per-community reads/writes then use a scoped client. Same
  // posture as the snowbird + notification-digest processors.
  resolve(repoRoot, 'apps/web/src/lib/services/insurance-alert-processor.ts'),
  // Insurance-alerts no-login unsubscribe write — token-authenticated, no
  // session; the signed token confines the write to the exact (communityId,
  // userId) it encodes (the notification_preferences.email_insurance_alerts flag).
  resolve(repoRoot, 'apps/web/src/lib/services/insurance-alert-unsubscribe-service.ts'),
  // PR #2: Site asset quota lookup — communities is the root tenant table (no communityId column);
  // plan resolution requires unscoped read. Routes calling these helpers MUST have already
  // verified caller's management-tier property_manager/root_manager membership in the target community.
  resolve(repoRoot, 'apps/web/src/lib/site-assets/quota.ts'),
  // PR #5: Starter pack apply — reads platform-level site_starter_packs catalog (no community_id);
  // inserts into site_blocks via scoped client after community creation.
  resolve(repoRoot, 'apps/web/src/lib/services/starter-pack-service.ts'),
  // PR #5b: Theme preset catalog reader — reads platform-level site_theme_presets
  // (no community_id). Powers the onboarding wizard Step 2 preset chooser.
  // Routes calling this helper MUST have already verified management-tier
  // (property_manager / root_manager) membership in the target community and the `hasSiteEditor` plan feature.
  resolve(repoRoot, 'apps/web/src/lib/db/theme-preset-catalog.ts'),
  // DBB-01: createAdminClient (service-role, RLS-bypassing) is no longer
  // re-exported from the root @propertypro/db barrel — callers now import it
  // from the guarded @propertypro/db/supabase/admin subpath, which brings them
  // under this allowlist. Each of these uses the admin client for a legitimate
  // pre-tenant/auth-provider operation (auth user_metadata, Storage cleanup,
  // PDF/image finalize, authored-doc + esign PDF generation).
  resolve(repoRoot, 'apps/web/src/lib/documents/create-authored-document.ts'),
  resolve(repoRoot, 'apps/web/src/lib/services/esign-pdf-service.ts'),
  resolve(repoRoot, 'apps/web/src/lib/site-assets/cleanup.ts'),
  resolve(repoRoot, 'apps/web/src/app/api/v1/site/images/finalize/route.ts'),
  resolve(repoRoot, 'apps/web/src/app/api/v1/account/profile/route.ts'),
  resolve(repoRoot, 'apps/web/src/app/api/v1/documents/drafts/[id]/images/route.ts'),
]);

const APP_CONFIGS: AppGuardConfig[] = [
  {
    appDir: join(repoRoot, 'apps', 'web', 'src'),
    mode: 'scoped',
    unsafeAllowlist: WEB_UNSAFE_IMPORT_ALLOWLIST,
    usedUnsafe: new Set<string>(),
  },
  {
    appDir: join(repoRoot, 'apps', 'admin', 'src'),
    mode: 'admin',
    unsafeAllowlist: new Set<string>(),
  },
];

const NO_RLS_ALLOWLIST = new Set<string>([
  // Core tenant tables were created before migration-level RLS enforcement and are covered by later hardening migrations.
  'communities',
  'users',
  'user_roles',
  'units',
  'document_categories',
  'documents',
  'notification_preferences',
  'announcements',
  'compliance_audit_log',
  'compliance_checklist_items',
  'invitations',
  'meetings',
  'meeting_documents',
  'announcement_delivery_log',
  'demo_seed_registry',
  'leases',
  'notification_digest_queue',
  'pending_signups',
  'stripe_webhook_events',
  'provisioning_jobs',
  'maintenance_requests',
  'onboarding_wizard_state',
  'contracts',
  'contract_bids',
  'maintenance_comments',
  // user_search_index mirrors auth.users for search — no community_id, not tenant-scoped
  'user_search_index',
  // PR #1a: site_blocks platform tables — ENABLE RLS covered by 0005_site_blocks_rls_hardening
  'site_theme_presets',
  'site_starter_packs',
  'site_layout_metadata',
]);

function listRuntimeSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listRuntimeSourceFiles(absolute));
      continue;
    }

    if (entry.isFile() && (absolute.endsWith('.ts') || absolute.endsWith('.tsx'))) {
      files.push(absolute);
    }
  }

  return files;
}

function lineCol(sourceFile: ts.SourceFile, position: number): { line: number; column: number } {
  const lc = sourceFile.getLineAndCharacterOfPosition(position);
  return { line: lc.line + 1, column: lc.character + 1 };
}

function validateSpecifier(
  specifier: string,
  file: string,
  config: AppGuardConfig,
  sourceFile: ts.SourceFile,
  position: number,
  violations: Violation[],
): void {
  const lc = lineCol(sourceFile, position);

  if (specifier === 'drizzle-orm' || specifier.startsWith('drizzle-orm/')) {
    violations.push({
      file,
      line: lc.line,
      column: lc.column,
      code: 'DB001',
      message: `Direct drizzle import is forbidden in runtime code: "${specifier}".`,
    });
    return;
  }

  if (
    specifier.startsWith('@propertypro/db/src/') ||
    specifier.startsWith('packages/db/src/') ||
    specifier.includes('/packages/db/src/') ||
    specifier.startsWith('../packages/db/src/') ||
    specifier.startsWith('../../packages/db/src/') ||
    specifier.startsWith('../../../packages/db/src/') ||
    specifier.startsWith('../../../../packages/db/src/')
  ) {
    violations.push({
      file,
      line: lc.line,
      column: lc.column,
      code: 'DB002',
      message: `Direct db source import is forbidden: "${specifier}".`,
    });
    return;
  }

  if (!specifier.startsWith('@propertypro/db/')) {
    return;
  }

  if (!ALLOWED_DB_SUBPATHS.has(specifier)) {
    violations.push({
      file,
      line: lc.line,
      column: lc.column,
      code: 'DB003',
      message: `Unsupported @propertypro/db subpath import: "${specifier}".`,
    });
    return;
  }

  if (
    (specifier === '@propertypro/db/unsafe' || specifier === '@propertypro/db/supabase/admin') &&
    config.mode === 'scoped'
  ) {
    if (config.unsafeAllowlist.has(file)) {
      // Record that this allowlist entry is still earning its place, so the
      // dead-entry sweep in runAppGuard can flag the ones that aren't.
      config.usedUnsafe?.add(file);
    } else {
      violations.push({
        file,
        line: lc.line,
        column: lc.column,
        code: 'DB004',
        message: `Unsafe db import is not allowlisted in this file: "${specifier}".`,
      });
    }
  }
}

function collectViolationsForFile(file: string, config: AppGuardConfig): Violation[] {
  const content = readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const violations: Violation[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      validateSpecifier(
        node.moduleSpecifier.text,
        file,
        config,
        sourceFile,
        node.moduleSpecifier.getStart(sourceFile),
        violations,
      );
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]!)
    ) {
      const arg = node.arguments[0]!;
      validateSpecifier(
        arg.text,
        file,
        config,
        sourceFile,
        arg.getStart(sourceFile),
        violations,
      );
    }

    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      validateSpecifier(
        node.moduleSpecifier.text,
        file,
        config,
        sourceFile,
        node.moduleSpecifier.getStart(sourceFile),
        violations,
      );
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

function lineColForText(content: string, position: number): { line: number; column: number } {
  const prefix = content.slice(0, position);
  const lines = prefix.split('\n');
  const lastLine = lines[lines.length - 1] ?? '';
  return { line: lines.length, column: lastLine.length + 1 };
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function hasTableRlsEnable(sql: string, tableName: string): boolean {
  const escapedTableName = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:(?:"[^"]+"|\\w+)\\.)?(?:"${escapedTableName}"|${escapedTableName})\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
    'i',
  );
  return pattern.test(sql);
}

function hasTableRlsForce(sql: string, tableName: string): boolean {
  const escapedTableName = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:(?:"[^"]+"|\\w+)\\.)?(?:"${escapedTableName}"|${escapedTableName})\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`,
    'i',
  );
  return pattern.test(sql);
}

function hasTenantWriteScopeTrigger(
  sql: string,
  tableName: string,
  triggerName = 'pp_rls_enforce_tenant_scope',
): boolean {
  const escapedTableName = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedTriggerName = triggerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Direct CREATE TRIGGER form, e.g.
  //   CREATE TRIGGER "pp_rls_enforce_tenant_scope" BEFORE INSERT OR UPDATE
  //   ON "public"."tableName" FOR EACH ROW EXECUTE FUNCTION ...
  // Two corrections over the naive form, both needed for this to mean anything:
  //
  // 1. The word-boundary belongs INSIDE the unquoted alternative only. A
  //    trailing \b after the quoted form can never match — the characters
  //    either side of the closing quote (`"` and `;`/newline) are both
  //    non-word, so there is no boundary there. Every migration writes the
  //    quoted form, so with \b outside the group this pattern silently never
  //    fired and only the loop/ARRAY form below carried the check — which is
  //    why access_requests and community_join_requests, whose triggers 0021
  //    creates in the direct form, reported false DB005 violations.
  //
  // 2. The gap is `[^;]*?`, not `[\s\S]*?`. The ON clause must live in the
  //    SAME statement as the CREATE TRIGGER. With `[\s\S]*?` the match could
  //    bridge across unrelated statements in the concatenated corpus and pair
  //    a CREATE TRIGGER with some later `ON "public"."other_table"` (e.g. a
  //    CREATE POLICY), reporting a trigger that does not exist.
  const directPattern = new RegExp(
    `CREATE\\s+TRIGGER\\s+(?:"${escapedTriggerName}"|\\b${escapedTriggerName}\\b)[^;]*?\\sON\\s+(?:(?:"[^"]+"|\\w+)\\.)?(?:"${escapedTableName}"|\\b${escapedTableName}\\b)`,
    'i',
  );
  if (directPattern.test(sql)) return true;

  // Loop-based form where the trigger is installed via dynamic SQL across an
  // array of table names. Match the table name appearing in a `SELECT
  // unnest(ARRAY[ ... ])` literal AND a CREATE TRIGGER pp_rls_enforce_tenant_scope
  // reference somewhere in the corpus.
  const arrayContainsTable = new RegExp(
    `unnest\\s*\\(\\s*ARRAY\\s*\\[[\\s\\S]*?'${escapedTableName}'[\\s\\S]*?\\]`,
    'i',
  );
  const hasLoopTriggerInstall = new RegExp(
    `CREATE\\s+TRIGGER\\s+(?:"${escapedTriggerName}"|\\b${escapedTriggerName}\\b)`,
    'i',
  );
  return arrayContainsTable.test(sql) && hasLoopTriggerInstall.test(sql);
}

function stripSqlComments(sql: string): string {
  // Replace block comments /* ... */ with equivalent whitespace (preserves newlines for accurate line reporting)
  let s = sql.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '));
  // Replace line comments -- ... with equivalent whitespace
  s = s.replace(/--[^\r\n]*/g, (match) => ' '.repeat(match.length));
  return s;
}

function runAppGuard(config: AppGuardConfig): number {
  if (!isDirectory(config.appDir)) {
    // eslint-disable-next-line no-console
    console.log(`SKIP: DB access guard skipped for ${config.appDir} (${config.mode} mode, directory not found).`);
    return 0;
  }

  const files = listRuntimeSourceFiles(config.appDir);
  const violations = files.flatMap((file) => collectViolationsForFile(file, config));

  // Dead allowlist entries: allowlisted files that no longer import an
  // unsafe/admin client (or were deleted). Shrink-only ledger hygiene (DBB-03),
  // mirroring the sweep in verify-route-table-imports.ts.
  const deadAllowlistEntries = config.usedUnsafe
    ? [...config.unsafeAllowlist].filter((entry) => !config.usedUnsafe!.has(entry)).sort()
    : [];

  if (violations.length === 0 && deadAllowlistEntries.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      `PASS: DB access guard is clean for ${files.length} runtime files in ${config.appDir} (${config.mode} mode).`,
    );
    return 0;
  }

  for (const violation of violations) {
    // eslint-disable-next-line no-console
    console.error(
      `${violation.file}:${violation.line}:${violation.column} [${violation.code}] ${violation.message}`,
    );
  }

  if (deadAllowlistEntries.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `\n${deadAllowlistEntries.length} dead WEB_UNSAFE_IMPORT_ALLOWLIST entr${deadAllowlistEntries.length === 1 ? 'y' : 'ies'} ` +
        `(no longer import @propertypro/db/unsafe or /supabase/admin). Remove from the allowlist:`,
    );
    for (const entry of deadAllowlistEntries) {
      // eslint-disable-next-line no-console
      console.error(`  - ${relative(repoRoot, entry)}`);
    }
  }

  if (violations.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `FAIL: ${violations.length} DB access violation(s) found in ${config.appDir} (${config.mode} mode).`,
    );
  }
  return 1;
}

function runRlsPolicyCheck(): number {
  if (!isDirectory(migrationsRoot)) {
    // eslint-disable-next-line no-console
    console.error(`Migrations directory not found: ${migrationsRoot}`);
    return 1;
  }

  const migrationFiles = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => join(migrationsRoot, entry.name))
    .sort();
  const violations: Violation[] = [];

  for (const migrationFile of migrationFiles) {
    const sql = readFileSync(migrationFile, 'utf8');
    const cleanedSql = stripSqlComments(sql);
    // Group 1: quoted identifier (e.g. "my-table"), Group 2: unquoted identifier (e.g. my_table)
    const createTablePattern =
      /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:(?:"[^"]+"|\w+)\.)?(?:"([^"]+)"|(\w+))/gi;
    const seenTables = new Set<string>();
    let match: RegExpExecArray | null = createTablePattern.exec(cleanedSql);

    while (match !== null) {
      const originalTableName = match[1] ?? match[2] ?? '';
      const tableName = originalTableName.toLowerCase();
      if (originalTableName.length > 0 && !seenTables.has(tableName)) {
        seenTables.add(tableName);
        if (!NO_RLS_ALLOWLIST.has(tableName) && !hasTableRlsEnable(cleanedSql, originalTableName)) {
          const lc = lineColForText(cleanedSql, match.index);
          violations.push({
            file: migrationFile,
            line: lc.line,
            column: lc.column,
            code: 'DB005',
            message: `Migration creates table "${originalTableName}" without enabling row level security in the same file.`,
          });
        }
      }
      match = createTablePattern.exec(cleanedSql);
    }
  }

  if (violations.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`PASS: RLS policy check is clean for ${migrationFiles.length} migration files.`);
    return 0;
  }

  for (const violation of violations) {
    // eslint-disable-next-line no-console
    console.error(
      `${violation.file}:${violation.line}:${violation.column} [${violation.code}] ${violation.message}`,
    );
  }
  // eslint-disable-next-line no-console
  console.error(`FAIL: ${violations.length} RLS policy violation(s) found.`);
  return 1;
}

/**
 * Inventory-driven RLS coverage check.
 *
 * RLS hardening for a tenant table is frequently split across several
 * migrations (e.g. initial CREATE TABLE in one file, FORCE + write-scope
 * trigger added later). The audit's intent — "every tenant table has RLS
 * ENABLE + FORCE, at least one policy, and (unless service/audit-only) the
 * write-scope trigger" — is therefore a coverage check across the entire
 * migration corpus rather than a per-file rule. Complements the non-gating
 * live integration test (which needs DATABASE_URL); this runs in every PR.
 */
async function runRlsTenantTableCoverageCheck(): Promise<number> {
  if (!isDirectory(migrationsRoot)) {
    // eslint-disable-next-line no-console
    console.error(`Migrations directory not found: ${migrationsRoot}`);
    return 1;
  }

  const migrationFiles = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => join(migrationsRoot, entry.name))
    .sort();

  const corpus = stripSqlComments(
    migrationFiles.map((f) => readFileSync(f, 'utf8')).join('\n'),
  );

  type RlsTenantTableConfig = {
    tableName: string;
    policyFamily: string;
  };
  let RLS_TENANT_TABLES: readonly RlsTenantTableConfig[];
  try {
    const mod = await import('../packages/db/src/schema/rls-config.ts');
    RLS_TENANT_TABLES = mod.RLS_TENANT_TABLES as readonly RlsTenantTableConfig[];
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      'Could not load RLS_TENANT_TABLES from packages/db/src/schema/rls-config.ts:',
      err,
    );
    return 1;
  }

  // service_only and audit_log_restricted tables are written exclusively under
  // a privileged role; append-only tables take INSERT-only writes. The generic
  // INSERT/UPDATE write-scope trigger is not installed on those families.
  // Policy families that legitimately have NO pp_rls_enforce_tenant_scope
  // trigger. Keep in sync with RlsPolicyFamily in
  // packages/db/src/schema/rls-config.ts — this set is hardcoded, so a new
  // trigger-exempt family must be added here or DB005 fires spuriously.
  const FAMILIES_WITHOUT_TRIGGER = new Set([
    'service_only',
    'audit_log_restricted',
    'tenant_append_only',
    // No authenticated write path at all (anon/authenticated SELECT only,
    // writes are service-role) — so there is nothing for a write-scope
    // trigger to guard. Added for site_blocks in #763.
    'public_read_service_write',
  ]);

  // Tables whose write-scope trigger runs the canonical
  // pp_rls_enforce_tenant_community_id() function under a PRE-CONVENTION NAME.
  // Each was confirmed in migration 0000: same BEFORE INSERT OR UPDATE timing,
  // same function body — only the trigger's name differs, so renaming them would
  // be churn requiring a production apply. Asserted by exact name, so dropping or
  // swapping one of these triggers still fails DB005.
  // Keep in sync with `legacyTriggerNames` in
  // packages/db/__tests__/rls-policies.integration.test.ts, which asserts the
  // same names against the live database.
  const LEGACY_WRITE_SCOPE_TRIGGER_NAMES: Record<string, string> = {
    denied_visitors: 'enforce_denied_visitors_community_scope',
    document_drafts: 'document_drafts_tenant_scope',
    faqs: 'faqs_tenant_scope',
    help_article_feedback: 'help_article_feedback_tenant_scope',
    move_checklists: 'move_checklists_tenant_scope',
    notifications: 'notifications_enforce_tenant_scope',
  };

  // KNOWN GAP, not a naming quirk: these two have community_id and tenant-scoped
  // policies but NO write-scope trigger under any name, so community_id on write
  // is guarded only by the policy WITH CHECK. Every other tenant_crud table has
  // one. Registered in rls-config on 2026-07-26 with the gap documented; closing
  // it needs its own migration, at which point this set should be emptied.
  const TABLES_WITHOUT_WRITE_SCOPE_TRIGGER = new Set([
    'emergency_broadcasts',
    'emergency_broadcast_recipients',
  ]);

  const violations: Violation[] = [];
  for (const entry of RLS_TENANT_TABLES) {
    const t = entry.tableName;
    if (!hasTableRlsEnable(corpus, t)) {
      violations.push({
        file: migrationsRoot,
        line: 0,
        column: 0,
        code: 'DB005',
        message: `Tenant table "${t}" has no ALTER TABLE … ENABLE ROW LEVEL SECURITY in any migration.`,
      });
    }
    if (!hasTableRlsForce(corpus, t)) {
      violations.push({
        file: migrationsRoot,
        line: 0,
        column: 0,
        code: 'DB005',
        message: `Tenant table "${t}" has no ALTER TABLE … FORCE ROW LEVEL SECURITY in any migration.`,
      });
    }
    // NOTE: policy-presence is intentionally NOT checked here. Per-family
    // CREATE POLICY coverage is verified with higher fidelity by the live
    // rls-policies integration test (pg_policies per family); a static text
    // scan for CREATE POLICY is both redundant and brittle against the
    // quote-wrapped baseline DDL. FORCE + write-scope-trigger coverage below
    // is what no other gate enforces, which is the gap this check fills.
    const expectedTriggerName = LEGACY_WRITE_SCOPE_TRIGGER_NAMES[t] ?? 'pp_rls_enforce_tenant_scope';
    if (
      !FAMILIES_WITHOUT_TRIGGER.has(entry.policyFamily) &&
      !TABLES_WITHOUT_WRITE_SCOPE_TRIGGER.has(t) &&
      !hasTenantWriteScopeTrigger(corpus, t, expectedTriggerName)
    ) {
      violations.push({
        file: migrationsRoot,
        line: 0,
        column: 0,
        code: 'DB005',
        message: `Tenant table "${t}" (${entry.policyFamily}) has no ${expectedTriggerName} trigger in any migration.`,
      });
    }
    // Guard the exemption itself: once a follow-up migration adds the missing
    // trigger, this fires and forces the entry to be removed rather than left
    // behind as a stale excuse.
    if (
      TABLES_WITHOUT_WRITE_SCOPE_TRIGGER.has(t) &&
      hasTenantWriteScopeTrigger(corpus, t, expectedTriggerName)
    ) {
      violations.push({
        file: migrationsRoot,
        line: 0,
        column: 0,
        code: 'DB005',
        message: `Tenant table "${t}" now has a write-scope trigger — remove it from TABLES_WITHOUT_WRITE_SCOPE_TRIGGER.`,
      });
    }
  }

  if (violations.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      `PASS: RLS tenant-table coverage check is clean for ${RLS_TENANT_TABLES.length} tables.`,
    );
    return 0;
  }

  for (const violation of violations) {
    // eslint-disable-next-line no-console
    console.error(`${violation.file} [${violation.code}] ${violation.message}`);
  }
  // eslint-disable-next-line no-console
  console.error(
    `FAIL: ${violations.length} tenant-table RLS coverage violation(s) found.`,
  );
  return 1;
}

async function main(): Promise<number> {
  let exitCode = 0;

  for (const config of APP_CONFIGS) {
    const code = runAppGuard(config);
    if (code !== 0) {
      exitCode = code;
    }
  }

  const rlsCode = runRlsPolicyCheck();
  if (rlsCode !== 0) {
    exitCode = rlsCode;
  }

  const coverageCode = await runRlsTenantTableCoverageCheck();
  if (coverageCode !== 0) {
    exitCode = coverageCode;
  }

  return exitCode;
}

main().then((code) => process.exit(code));
