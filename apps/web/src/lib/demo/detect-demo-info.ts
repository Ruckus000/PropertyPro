/**
 * Detects whether the current user is a demo user by querying the
 * demo_instances table. Replaces the previous email-regex approach
 * with authoritative DB-backed detection.
 */
import { and, eq, isNull, or } from '@propertypro/db/filters';
import { demoInstances, communities } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { computeDemoStatus, type DemoLifecycleStatus } from '@propertypro/shared';
import type { CommunityType } from '@propertypro/shared';

export interface DemoDetectionResult {
  isDemoMode: true;
  currentRole: 'board' | 'resident';
  slug: string;
  status: DemoLifecycleStatus;
  trialEndsAt: Date | null;
  demoExpiresAt: Date | null;
  communityType: CommunityType;
}

export async function detectDemoInfo(
  isDemo: boolean,
  userId: string,
  communityId: number,
): Promise<DemoDetectionResult | null> {
  if (!isDemo || !userId) return null;

  const db = createUnscopedClient();

  const [demo] = await db
    .select({
      slug: demoInstances.slug,
      demoBoardUserId: demoInstances.demoBoardUserId,
      demoResidentUserId: demoInstances.demoResidentUserId,
      demoExpiresAt: communities.demoExpiresAt,
      trialEndsAt: communities.trialEndsAt,
      communityType: communities.communityType,
      deletedAt: communities.deletedAt,
    })
    .from(demoInstances)
    .innerJoin(communities, eq(demoInstances.seededCommunityId, communities.id))
    .where(
      and(
        eq(demoInstances.seededCommunityId, communityId),
        isNull(demoInstances.deletedAt),
        or(
          eq(demoInstances.demoBoardUserId, userId),
          eq(demoInstances.demoResidentUserId, userId),
        ),
      ),
    )
    .limit(1);

  if (!demo) return null;

  const currentRole: 'board' | 'resident' =
    demo.demoBoardUserId === userId ? 'board' : 'resident';

  const status = computeDemoStatus({
    isDemo: true,
    trialEndsAt: demo.trialEndsAt,
    demoExpiresAt: demo.demoExpiresAt,
    deletedAt: demo.deletedAt,
  });

  return {
    isDemoMode: true,
    currentRole,
    slug: demo.slug,
    status,
    trialEndsAt: demo.trialEndsAt,
    demoExpiresAt: demo.demoExpiresAt,
    communityType: demo.communityType,
  };
}
