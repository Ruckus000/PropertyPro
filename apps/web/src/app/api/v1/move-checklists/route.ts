import { runRoute } from '@propertypro/api-contract';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { isAdminRole } from '@propertypro/shared';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import {
  createMoveChecklist,
  listMoveChecklists,
} from '@/lib/services/move-checklist-service';
import {
  createMoveChecklistContract,
  listMoveChecklistsContract,
} from './contract';

const listQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
  leaseId: z.coerce.number().int().positive().optional(),
  unitId: z.coerce.number().int().positive().optional(),
  type: z.enum(['move_in', 'move_out']).optional(),
  completed: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

export const GET = withErrorHandler(
  runRoute(listMoveChecklistsContract, async ({ req }) => {
    const userId = await requireAuthenticatedUserId();
    const { searchParams } = new URL(req.url);

    const rawQuery: Record<string, string | undefined> = {};
    for (const key of ['communityId', 'leaseId', 'unitId', 'type', 'completed']) {
      rawQuery[key] = searchParams.get(key) ?? undefined;
    }

    const parseResult = listQuerySchema.safeParse(rawQuery);
    if (!parseResult.success) {
      throw new ValidationError('Invalid query', { fields: formatZodErrors(parseResult.error) });
    }

    const { communityId, ...filters } = parseResult.data;
    const membership = await requireCommunityMembership(communityId, userId);
    if (!isAdminRole(membership.role)) {
      throw new ForbiddenError('Forbidden');
    }
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    return listMoveChecklists(communityId, filters);
  }),
);

export const POST = withErrorHandler(
  runRoute(createMoveChecklistContract, async ({ body }) => {
    const userId = await requireAuthenticatedUserId();
    const { communityId } = body;
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    if (!isAdminRole(membership.role)) {
      throw new ForbiddenError('Forbidden');
    }

    return createMoveChecklist(body, userId);
  }),
);
