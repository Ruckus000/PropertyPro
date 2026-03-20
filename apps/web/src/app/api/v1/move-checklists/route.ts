import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { isAdminRole } from '@propertypro/shared';
import {
  createMoveChecklist,
  listMoveChecklists,
} from '@/lib/services/move-checklist-service';

const listQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
  leaseId: z.coerce.number().int().positive().optional(),
  unitId: z.coerce.number().int().positive().optional(),
  type: z.enum(['move_in', 'move_out']).optional(),
  completed: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

const createSchema = z.object({
  communityId: z.number().int().positive(),
  leaseId: z.number().int().positive(),
  unitId: z.number().int().positive(),
  residentId: z.string().uuid(),
  type: z.enum(['move_in', 'move_out']),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
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
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rows = await listMoveChecklists(communityId, filters);
  return NextResponse.json({ data: rows });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const body = await req.json();

  const parseResult = createSchema.safeParse(body);
  if (!parseResult.success) {
    throw new ValidationError('Invalid checklist data', { fields: formatZodErrors(parseResult.error) });
  }

  const { communityId } = parseResult.data;
  const membership = await requireCommunityMembership(communityId, userId);
  if (!isAdminRole(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const checklist = await createMoveChecklist(parseResult.data, userId);
  return NextResponse.json({ data: checklist }, { status: 201 });
});
