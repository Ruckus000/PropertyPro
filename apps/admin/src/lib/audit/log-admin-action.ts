/**
 * The one way to record a privileged platform-admin action.
 *
 * ## Why this exists
 *
 * Before this, `apps/admin` had FIVE competing logging idioms — raw
 * `compliance_audit_log` inserts (in two different flavours, one
 * fire-and-forget and one that 500s the request), a single dynamically-imported
 * `logAuditEvent`, `support_access_log`, `conversion_events`, and
 * `console.error` — and eleven privileged mutations that wrote nothing at all.
 * There was no record of who granted platform admin, who hard-deleted a tenant,
 * or who un-deleted one.
 *
 * ## Why not `logAuditEvent` from `@propertypro/db`
 *
 * Three independent blockers, any one of which is disqualifying:
 *
 * 1. Its `communityId` is a required non-null `number`. Platform-level actions
 *    (granting/revoking admin) have no community at all.
 * 2. Its `action` is a closed ~90-member union, none of which are platform
 *    actions, and it targets `compliance_audit_log` — the statutory,
 *    tenant-visible §718.111(12) trail. Operator activity does not belong there.
 * 3. It goes through Drizzle, whose module throws at import time when
 *    `DATABASE_URL` is unset. Admin's entire data layer is the service-role
 *    PostgREST client; the one pre-existing `logAuditEvent` call site uses a
 *    *dynamic* import purely to defer that throw to request time.
 *
 * ## Failure semantics
 *
 * Throws by default. An unrecorded admin-grant, tenant-delete or free-access
 * grant is worse than a failed one — if we cannot write the audit entry, the
 * caller should not report success. Callers that genuinely prefer availability
 * over the record pass `bestEffort: true`, which downgrades to a Sentry
 * capture; today that is only the file upload.
 *
 * Call this AFTER the mutation succeeds, so a failed mutation is never recorded
 * as done. The one exception is the demo hard-delete, which destroys the
 * community it is reporting on — capture `oldValues` first, write the entry
 * after, and rely on the table's `ON DELETE SET NULL`.
 */
import { createAdminClient } from '@propertypro/db/supabase/admin';
import * as Sentry from '@sentry/nextjs';
import type { PlatformAdminUser } from '@/lib/auth/platform-admin';

/**
 * Platform-admin actions. Typed here rather than as a pg enum so adding one
 * does not require a migration.
 */
export type AdminAuditAction =
  // Platform admin roster — no community
  | 'platform_admin_added'
  | 'platform_admin_removed'
  // Community membership
  | 'member_role_changed'
  | 'member_removed'
  // Branding (a REAL community — the demo equivalents are below)
  | 'community_branding_changed'
  // Demo lifecycle
  | 'demo_deleted'
  | 'demo_community_changed'
  | 'demo_branding_changed'
  // Access plans (free access grants — money)
  | 'access_plan_granted'
  | 'access_plan_revoked'
  | 'access_plan_extended'
  // Account/community deletion lifecycle
  | 'deletion_request_intervened'
  | 'deletion_request_recovered'
  // Site templates
  | 'site_template_reset'
  | 'site_template_restored'
  // Settings
  | 'community_settings_changed'
  // Storage
  | 'file_uploaded';

export interface LogAdminActionParams {
  /** The `requirePlatformAdmin()` return value — carries id AND email. */
  admin: Pick<PlatformAdminUser, 'id' | 'email'>;
  action: AdminAuditAction;
  resourceType: string;
  resourceId?: string | number | null;
  /**
   * Null/omitted for genuinely platform-level actions. This is the column that
   * no existing audit table could provide.
   */
  communityId?: number | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  /**
   * Swallow write failures (report to Sentry instead of throwing). Reserve this
   * for actions where losing the record is preferable to failing the request.
   */
  bestEffort?: boolean;
}

/**
 * Thrown when the audit write fails and the caller did not opt into
 * `bestEffort`.
 *
 * The message deliberately states that the OPERATION SUCCEEDED. Every caller
 * logs after its mutation has already committed, so by the time this is thrown
 * the admin has been added / the tenant deleted / the grant issued. An operator
 * who reads a bare "500" after a destructive action will reasonably retry it —
 * which for the demo hard-delete means attempting to destroy a community twice.
 * The distinction has to be in the text, because `withAdminErrorHandler` maps
 * this to a generic INTERNAL_ERROR envelope.
 *
 * The most likely cause in practice is migration 0052 not yet being applied:
 * prod migrations are applied MANUALLY and `deploy.yml` auto-deploys on CI
 * success, so shipping this code first makes every wired mutation throw here.
 * That is why 0052 is expand-before-code.
 */
export class AdminAuditLogError extends Error {
  constructor(action: string, cause: string) {
    super(
      `The "${action}" operation COMPLETED, but writing its audit-log entry failed: ${cause}. ` +
        'Do not retry the operation — verify platform_admin_audit_log is present and writable.',
    );
    this.name = 'AdminAuditLogError';
  }
}

function normalizeResourceId(id: string | number | null | undefined): string | null {
  if (id === null || id === undefined) return null;
  return String(id);
}

export async function logAdminAction(params: LogAdminActionParams): Promise<void> {
  const db = createAdminClient();

  const row = {
    admin_user_id: params.admin.id,
    // Denormalized so the trail stays readable after the account is gone.
    admin_email: params.admin.email || null,
    action: params.action,
    resource_type: params.resourceType,
    resource_id: normalizeResourceId(params.resourceId),
    community_id: params.communityId ?? null,
    old_values: params.oldValues ?? null,
    new_values: params.newValues ?? null,
    metadata: params.metadata ?? null,
  };

  let failure: string | null = null;
  try {
    const { error } = await db.from('platform_admin_audit_log').insert(row as never);
    // PostgREST RESOLVES with an { error } object rather than throwing, so a
    // bare `await` here would swallow every write failure silently.
    if (error) failure = error.message;
  } catch (caught) {
    failure = caught instanceof Error ? caught.message : String(caught);
  }

  if (!failure) return;

  if (params.bestEffort) {
    Sentry.captureException(new AdminAuditLogError(params.action, failure), {
      level: 'warning',
      tags: { audit_action: params.action },
    });
    return;
  }

  Sentry.captureException(new AdminAuditLogError(params.action, failure), {
    tags: { audit_action: params.action },
  });
  throw new AdminAuditLogError(params.action, failure);
}
