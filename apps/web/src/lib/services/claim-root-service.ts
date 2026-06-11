// AUTHZ: claim-root is the one sanctioned path for a property_manager to become
// root (spec §3.5(1)(b)). It self-authorizes via the explicit property_manager +
// rootless checks below; findMyRootlessCommunities (cross-community) comes from
// @propertypro/db/unsafe. This file MUST be added to WEB_UNSAFE_IMPORT_ALLOWLIST
// in scripts/verify-scoped-db-access.ts (the // AUTHZ comment alone is insufficient
// — both guards apply; this is the #718 two-guard lesson).
import { createScopedClient, logAuditEvent, userRoles } from '@propertypro/db';
import { findMyRootlessCommunities } from '@propertypro/db/unsafe';
import { and, eq } from '@propertypro/db/filters';
import { ForbiddenError } from '@/lib/api/errors';
import { notifyRootClaimed } from '@/lib/services/claim-root-notify';

export interface ClaimResult {
  communityId: number;
  claimed: boolean;
  reason?: 'already_claimed';
}

/**
 * Claim root for one community. The caller must hold `property_manager` there and
 * the community must be rootless. Race-safe via the one-root partial unique index:
 * a concurrent winner causes a 23505 on the losing UPDATE, surfaced as
 * `already_claimed` (never a throw).
 */
export async function claimRoot(
  userId: string,
  communityId: number,
): Promise<ClaimResult> {
  const scoped = createScopedClient(communityId);

  // 1. Caller holds property_manager here?
  const mine = (await scoped.selectFrom(
    userRoles,
    {},
    and(eq(userRoles.userId, userId), eq(userRoles.role, 'property_manager')),
  )) as Array<Record<string, unknown>>;
  if (mine.length === 0) {
    throw new ForbiddenError(
      'Only a property manager of this community can claim root.',
    );
  }

  // 2. Community already has a root?
  const existingRoot = (await scoped.selectFrom(
    userRoles,
    {},
    eq(userRoles.role, 'root_manager'),
  )) as unknown[];
  if (existingRoot.length > 0) {
    return { communityId, claimed: false, reason: 'already_claimed' };
  }

  // 3. Flip my row to root_manager — the one-root index makes a concurrent
  //    winner exclusive (the loser hits a 23505 unique violation).
  try {
    await scoped.update(
      userRoles,
      { role: 'root_manager', updatedAt: new Date() },
      and(eq(userRoles.userId, userId), eq(userRoles.role, 'property_manager')),
    );
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      return { communityId, claimed: false, reason: 'already_claimed' };
    }
    throw err;
  }

  await logAuditEvent({
    userId,
    action: 'root_claimed',
    resourceType: 'community',
    resourceId: String(communityId),
    communityId,
    newValues: { role: 'root_manager' },
  });

  // Best-effort: a Resend/notification failure must NOT 500 a claim that already
  // committed (nor abort a claim-all batch). Mirrors 2a's offboarding-flag posture.
  try {
    await notifyRootClaimed(communityId, userId);
  } catch (notifyErr) {
    console.warn('[claim-root] notify failed (claim already committed)', {
      communityId,
      notifyErr,
    });
  }

  return { communityId, claimed: true };
}

/**
 * Claim root for every community where the caller is a rootless property_manager.
 * Each claim is isolated in its own try/catch so one failure never aborts the
 * batch (mirrors the `pm/bulk/*` allSettled posture). A failed claim is reported
 * as `already_claimed` — the safe, idempotent default for a re-run.
 */
export async function claimAllRoots(userId: string): Promise<ClaimResult[]> {
  const communities = await findMyRootlessCommunities(userId);
  const results: ClaimResult[] = [];
  for (const community of communities) {
    try {
      results.push(await claimRoot(userId, community.id));
    } catch (err) {
      console.warn('[claim-root] claim-all entry failed', {
        communityId: community.id,
        err,
      });
      results.push({
        communityId: community.id,
        claimed: false,
        reason: 'already_claimed',
      });
    }
  }
  return results;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  );
}
