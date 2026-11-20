import 'server-only';

import { headers } from 'next/headers';
import { isEntitledState, resolveLifecycleState, type CommunityType } from '@propertypro/shared';
import { SUPPORT_SESSION_HEADER } from '@/lib/request/forwarded-headers';
import { ensureTransparencyChecklistInitialized } from '@/lib/services/transparency-service';

interface ChecklistPageMembership {
  isAdmin: boolean;
  communityType: CommunityType;
  subscriptionStatus: string | null;
  subscriptionCanceledAt: Date | null;
  freeAccessExpiresAt: Date | null;
}

/**
 * Give a condo or HOA its statutory record list before a page that draws it
 * (Documents' setup guide, Compliance's first run). The list is created with
 * the community, best-effort; this fills any gap, as the website home does.
 * Idempotent: it inserts only missing rows, and a new row's 30-day posting
 * clock starts now, exactly as on the website home.
 *
 * Only for a manager of an entitled community (a lapsed one's checklist read
 * is refused anyway), and never in a support session, which must not write.
 * A failure is logged and never takes the page down.
 * ponytail: one extra read per manager page load. Trigger: the page's p95 regresses.
 */
export async function ensureChecklistForManagerPage(
  communityId: number,
  membership: ChecklistPageMembership,
): Promise<void> {
  if (!membership.isAdmin) return;
  if (membership.communityType !== 'condo_718' && membership.communityType !== 'hoa_720') return;
  const entitled = isEntitledState(
    resolveLifecycleState({
      subscriptionStatus: membership.subscriptionStatus,
      subscriptionCanceledAt: membership.subscriptionCanceledAt,
      freeAccessExpiresAt: membership.freeAccessExpiresAt,
    }),
  );
  if (!entitled) return;
  if ((await headers()).get(SUPPORT_SESSION_HEADER) === '1') return;
  try {
    await ensureTransparencyChecklistInitialized(communityId, membership.communityType);
  } catch (err) {
    console.error('[compliance] ensureTransparencyChecklistInitialized failed', { communityId, err });
  }
}
