import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { demoInstances, communities } from '@propertypro/db';
import { eq, and, isNull, lt } from '@propertypro/db/filters';
import { createAdminClient } from '@propertypro/db/supabase/admin';

export const POST = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.DEMO_EXPIRY_CRON_SECRET);

  const db = createUnscopedClient();
  const now = new Date();

  // Find all expired demo communities with their demo instance records
  const expired = await db
    .select({
      communityId: communities.id,
      demoInstanceId: demoInstances.id,
      demoResidentUserId: demoInstances.demoResidentUserId,
      demoBoardUserId: demoInstances.demoBoardUserId,
    })
    .from(communities)
    .innerJoin(demoInstances, eq(demoInstances.seededCommunityId, communities.id))
    .where(
      and(
        eq(communities.isDemo, true),
        lt(communities.demoExpiresAt, now),
        isNull(communities.deletedAt),
        isNull(demoInstances.deletedAt),
      ),
    );

  const admin = createAdminClient();
  let count = 0;

  for (const row of expired) {
    // Soft-delete the community
    await db
      .update(communities)
      .set({ deletedAt: now })
      .where(and(eq(communities.id, row.communityId), isNull(communities.deletedAt)));

    // Soft-delete the demo instance
    await db
      .update(demoInstances)
      .set({ deletedAt: now })
      .where(and(eq(demoInstances.id, row.demoInstanceId), isNull(demoInstances.deletedAt)));

    // Ban demo auth users
    const userIds = [row.demoResidentUserId, row.demoBoardUserId].filter(Boolean);
    for (const userId of userIds) {
      try {
        await admin.auth.admin.updateUserById(userId!, { ban_duration: '876600h' });
        console.info(`[expire-demos] banned demo user ${userId}`);
      } catch (err) {
        // Non-fatal: demo user may have already been deleted or banned
        console.warn(`[expire-demos] failed to ban demo user ${userId}:`, err);
      }
    }

    console.info(
      `[expire-demos] expired community ${row.communityId} / demo instance ${row.demoInstanceId}`,
    );
    count++;
  }

  return NextResponse.json({ data: { expired: count } });
});
