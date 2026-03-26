import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  requireViolationAdminWrite,
  requireViolationsEnabled,
  requireViolationsWritePermission,
} from '@/lib/violations/common';
import { imposeViolationFineForCommunity } from '@/lib/services/violations-service';

const imposeFineSchema = z.object({
  communityId: z.number().int().positive(),
  amountCents: z.number().int().positive(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  graceDays: z.number().int().min(1).max(120).optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const POST = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const id = parsePositiveInt(params?.id ?? '', 'violation id');
    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parseResult = imposeFineSchema.safeParse(body);

    if (!parseResult.success) {
      throw new ValidationError('Invalid fine payload', {
        fields: formatZodErrors(parseResult.error),
      });
    }

    const communityId = parseCommunityIdFromBody(req, parseResult.data.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    await requireViolationsEnabled(membership);
    requireViolationsWritePermission(membership);
    requireViolationAdminWrite(membership);

    const requestId = req.headers.get('x-request-id');
    const data = await imposeViolationFineForCommunity(
      communityId,
      id,
      actorUserId,
      {
        amountCents: parseResult.data.amountCents,
        dueDate: parseResult.data.dueDate,
        graceDays: parseResult.data.graceDays,
        notes: parseResult.data.notes ?? null,
      },
      requestId,
    );

    return NextResponse.json({ data }, { status: 201 });
  },
);
