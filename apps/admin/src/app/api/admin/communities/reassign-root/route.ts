/**
 * Platform-admin root reassignment for the admin platform (role-v3 Phase 2b).
 *
 * POST /api/admin/communities/reassign-root — reassign root_manager to an
 * existing property_manager of the community, resolving any open dispute.
 *
 * The transactional logic (property_manager-only guard, demote-then-promote
 * under the one-root partial unique index, dispute resolution, audit) lives in
 * `reassignRootOp` in @propertypro/db — the single source of truth shared with
 * the web service layer. This route only does platform-admin auth + input
 * validation + error mapping.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
// AUTHZ: platform-admin-only reassignment (requirePlatformAdmin gate above); reassignRootOp performs the atomic cross-community root swap.
import { reassignRootOp, RoleOpForbiddenError } from '@propertypro/db/unsafe';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { parseJsonBody } from '@/lib/api/parse-body';

const reassignSchema = z
  .object({
    communityId: z.number().int().positive(),
    newUserId: z.string().uuid(),
  })
  .strict();

export const POST = withAdminErrorHandler(async (request: NextRequest) => {
  const admin = await requirePlatformAdmin();

  const body = await parseJsonBody(request);
  if (body instanceof NextResponse) return body;
  const parsed = reassignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input' } },
      { status: 400 },
    );
  }

  const { communityId, newUserId } = parsed.data;

  try {
    await reassignRootOp({ communityId, newUserId, actingUserId: admin.id });
  } catch (err) {
    if (err instanceof RoleOpForbiddenError) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: err.message } },
        { status: 403 },
      );
    }
    const message = err instanceof Error ? err.message : 'Reassignment failed';
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ reassigned: true });
});
