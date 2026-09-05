/**
 * Shared authorization for the community-export job routes.
 *
 * Factored out because all five routes share the same chain, and because three
 * of its properties are easy to get wrong in a copy-paste:
 *
 * 1. There is NO entitlement gate. Deliberately. See the note on
 *    `requireExportAccess` below.
 * 2. Support impersonation is REFUSED. A full export is the single largest bulk
 *    PII egress in the product.
 * 3. The permission bar is management-tier-or-board, NOT `settings:read`. See
 *    `requireExportPermission` — `settings:read` reads like an admin gate and
 *    is not one.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-07.
 */
import type { NextRequest } from 'next/server';
import { ForbiddenError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireFreshReauth } from '@/lib/api/reauth-guard';
import { hasBoardDesignation } from '@propertypro/shared';
import { SUPPORT_SESSION_ID_HEADER } from '@/lib/request/forwarded-headers';

export interface ExportRouteContext {
  actorUserId: string;
  communityId: number;
  membership: CommunityMembership;
}

/**
 * Refuse under support impersonation.
 *
 * Support exists to troubleshoot an account, not to extract it. A board member
 * can always run the export themselves, so blocking here costs nothing real —
 * while allowing it would mean one compromised support session could exfiltrate
 * an association's complete dataset, documents included.
 *
 * The middleware sets `x-support-session-id` only on impersonated requests, and
 * strips inbound copies of it, so its presence is authoritative.
 */
function refuseUnderImpersonation(req: NextRequest): void {
  if (req.headers.get(SUPPORT_SESSION_ID_HEADER)) {
    throw new ForbiddenError(
      'Data export is not available during a support session. Ask a board member or manager to run it from their own account.',
    );
  }
}

/**
 * Who may export the association's complete records.
 *
 * ── This was `settings:read`, and that was wrong ──
 *
 * `settings:read` is granted to the **`owner`** row of the RBAC matrix
 * (`rbac-matrix.ts`), and `resolveMatrixRole` maps every `resident` with
 * `isUnitOwner: true` onto that row. So the bar admitted *every unit owner* —
 * only tenants were excluded — for an archive containing ~25 tables plus, by
 * default, every file in the community's `documents` bucket.
 *
 * That exceeded the owner's own entitlements in the same matrix, which denies
 * them `audit: read` and `contracts: read` while the archive ships
 * `compliance_audit_log`, `contracts`, `vendors` and `insurance_policies`. It
 * also bypassed the per-unit scoping that normally narrows finance and
 * violation reads, so an owner got the whole community's ledger, delinquency
 * history, fines and leases rather than their own.
 *
 * ── The bar this uses instead ──
 *
 * Management tier (`property_manager` / `root_manager`), or a board
 * designation. Two independent things point at the same line:
 *
 * - The RLS policies on `community_export_jobs` and its parts
 *   (`0058_community_export_jobs.sql`) already require
 *   `pp_rls_can_read_audit_log`, which is manager-only. The database was
 *   already expressing the intended bar; only the route disagreed. (Those
 *   policies never actually fire, because job rows are read with the service
 *   role — so they could not have caught this.)
 * - `/api/v1/audit-trail` gates on `audit:read`, which is exactly
 *   owner-denied / manager-allowed.
 *
 * Board designation is admitted on top because directors carry statutory
 * records duties under §718.111(12), and because a self-managed association's
 * board is the only party who would ever run this. Designation is orthogonal to
 * role (ADR-006 §3.2), so a board member is a `resident` and would otherwise be
 * refused — which would also make the impersonation message below a lie.
 *
 * Exported so the legacy synchronous `/api/v1/export` route shares this exact
 * predicate rather than a second copy. That route had the same `settings:read`
 * bar and ships every resident's name and email — a smaller archive, but the
 * same class of over-exposure, and two gates that can drift is how one of them
 * ends up wrong again.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-07.
 */
export function requireExportPermission(membership: CommunityMembership): void {
  if (isExportEligible(membership)) return;

  throw new ForbiddenError(
    'Only a property manager or a board member can export the community record set.',
  );
}

/**
 * The export bar as a PREDICATE, for callers that must decide rather than
 * refuse.
 *
 * The export-ready notification runs from a cron with no session and no request
 * to reject — it needs to know whether the original requester still qualifies,
 * and skip the mail if not. Sharing the rule with `requireExportPermission`
 * rather than restating it is the same discipline the docblock above already
 * argues for: two gates that can drift is how one of them ends up wrong.
 */
export function isExportEligible(membership: {
  isAdmin: boolean;
  /**
   * `unknown` deliberately: `hasBoardDesignation` is a type guard over
   * `unknown`, and the notification caller passes a raw `user_roles.designation`
   * column (`string | null`) rather than an already-narrowed
   * `CommunityMembership`. Narrowing here would force that caller to cast,
   * which is exactly the kind of assertion that lets a wrong value through.
   */
  designation: unknown;
}): boolean {
  return membership.isAdmin || hasBoardDesignation(membership.designation);
}

/**
 * Resolve and authorize an export request.
 *
 * read-entitlement:exempt — a lapsed association must be able to retrieve its
 * own statutory records; gating export behind entitlement is the failure mode,
 * not the protection.
 *
 * DELIBERATELY NOT gated by `requireEntitledForAdminRead`. Florida associations
 * carry record-retention duties (§718.111(12)(b)), and the Terms now promise
 * export "at any time, including after your subscription has lapsed". The
 * association that most needs its records — the one mid-cancellation — is
 * exactly the one an entitlement gate would lock out. Do not add one.
 */
export async function requireExportAccess(
  req: NextRequest,
  explicitCommunityId: number,
): Promise<ExportRouteContext> {
  const actorUserId = await requireAuthenticatedUserId();
  refuseUnderImpersonation(req);

  // Same fresh-reauth challenge the legacy sync export requires. It was missing
  // here, which meant a stolen session cookie was enough to pull the archive —
  // for a far larger dataset than the route that does ask.
  await requireFreshReauth(actorUserId);

  const communityId = resolveEffectiveCommunityId(req, explicitCommunityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireExportPermission(membership);

  return { actorUserId, communityId, membership };
}
