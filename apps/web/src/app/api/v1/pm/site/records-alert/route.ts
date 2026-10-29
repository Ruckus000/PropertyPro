/**
 * Website builder, D11 — `/api/v1/pm/site/records-alert`.
 *
 * GET   — how many Florida records the website still lacks, and this manager's
 *         snooze of the alert.
 * PATCH — snooze the alert for seven days.
 *
 * Authorization is the website routes' gate (`ensurePmAccess`, as the look and
 * live-notice routes use it): a management role in the target community plus
 * the `hasSiteEditor` plan feature, with a demo in its grace window refused
 * first on a write. The community is resolved by the runner. GET is also an
 * admin read, so it asks `requireEntitledForAdminRead`.
 *
 * The snooze is the caller's own state, not a change to the community: it is a
 * `user_preferences` row keyed by the session's user id (`site_records_alert:
 * <communityId>`) and written with `mergeUserPreference`, so a caller can only
 * ever touch their own and no audit row is written (as for the editor's
 * preferences, `/api/v1/pm/site-editor/preferences`).
 */
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import { runRoute } from '@/lib/api/run-route';
import { loadChecklistWithStatus } from '@/lib/compliance/load-checklist-with-status';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { getCommunityUnitCount } from '@/lib/services/community-profile-service';
import { getUserPreference, mergeUserPreference } from '@/lib/services/user-preferences-service';
import { missingRecordItems } from '@/lib/site-editor/records-status';
import type { ChecklistItemData } from '@/components/compliance/compliance-checklist-item';
import { recordsAlertGetContract, recordsAlertPatchContract } from './contract';

/** Seven days, in milliseconds (D11). */
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

const snoozeKey = (communityId: number) => `site_records_alert:${communityId}`;

/** The website routes' gate, minus the community step the runner has already taken. */
async function ensurePmAccess(communityId: number, { write }: { write: boolean }) {
  const userId = await requireAuthenticatedUserId();
  // A demo in its grace window is read-only. Before membership, per api-patterns.md.
  if (write) await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, userId);
  requireRole(membership, PM_MANAGER_ROLES, 'Only property managers can see the website records alert');
  await requirePlanFeature(communityId, 'hasSiteEditor');
  return { userId, membership };
}

/** The stored snooze when it is still in force, else null. Reads only the key this route writes. */
function readSnoozedUntil(stored: unknown, now: number): string | null {
  const value =
    typeof stored === 'object' && stored !== null
      ? (stored as Record<string, unknown>)['snoozedUntil']
      : undefined;
  if (typeof value !== 'string') return null;
  const until = new Date(value).getTime();
  return Number.isNaN(until) || until <= now ? null : value;
}

export const GET = withErrorHandler(
  runRoute(recordsAlertGetContract, async ({ communityId }) => {
    const { userId, membership } = await ensurePmAccess(communityId, { write: false });
    // Admin reads are additionally gated on entitlement (§4.1, enforced by
    // `guard:read-entitlement`). A lapsed community's manager cannot read.
    await requireEntitledForAdminRead(communityId, membership);

    const [checklist, unitCount, stored] = await Promise.all([
      loadChecklistWithStatus(communityId, membership.communityType),
      getCommunityUnitCount(communityId),
      getUserPreference(userId, snoozeKey(communityId)),
    ]);
    const missing = missingRecordItems(checklist as unknown as ChecklistItemData[], {
      communityType: membership.communityType,
      unitCount,
    });
    return { snoozedUntil: readSnoozedUntil(stored, Date.now()), missingCount: missing.length };
  }),
);

export const PATCH = withErrorHandler(
  runRoute(recordsAlertPatchContract, async ({ communityId }) => {
    const { userId } = await ensurePmAccess(communityId, { write: true });
    const snoozedUntil = new Date(Date.now() + SNOOZE_MS).toISOString();
    await mergeUserPreference(userId, snoozeKey(communityId), { snoozedUntil });
    return { snoozedUntil };
  }),
);
