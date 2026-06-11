/**
 * Platform-admin root reassignment for the admin platform (role-v3 Phase 2b).
 *
 * POST /api/admin/communities/reassign-root — reassign root_manager to an
 * existing property_manager of the community, resolving any open dispute.
 *
 * Mirrors the `reassignRoot` web service (apps/web/src/lib/services/
 * root-dispute-service.ts) but is inlined here because the admin app cannot
 * import the web app's `@/`-aliased service. Same guarantees: single
 * transaction, demote-then-promote under the one-root partial unique index,
 * NEVER promote a resident or insert a new row.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
// AUTHZ: platform-admin-only reassignment (requirePlatformAdmin gate above); uses the unscoped transaction client to swap two userRoles rows atomically under the one-root partial unique index.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import {
  createScopedClient,
  logAuditEvent,
  rootClaimDisputes,
  userRoles,
} from '@propertypro/db';
import { and, eq } from '@propertypro/db/filters';

const reassignSchema = z
  .object({
    communityId: z.number().int().positive(),
    newUserId: z.string().uuid(),
  })
  .strict();

export async function POST(request: NextRequest) {
  const admin = await requirePlatformAdmin();

  const parsed = reassignSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input' } },
      { status: 400 },
    );
  }

  const { communityId, newUserId } = parsed.data;

  try {
    const db = createUnscopedClient();

    await db.transaction(async (tx) => {
      const scoped = createScopedClient(
        communityId,
        tx as unknown as Parameters<typeof createScopedClient>[1],
      );

      // `newUserId` must already be a property_manager here — never promote a
      // resident or insert a new row (would trip chk_owner_flag_resident_only).
      const target = (await scoped.selectFrom(
        userRoles,
        {},
        and(eq(userRoles.userId, newUserId), eq(userRoles.role, 'property_manager')),
      )) as unknown[];
      if (target.length === 0) {
        throw new ForbiddenReassign(
          'No eligible property_manager to promote: the user must already be a property manager of this community.',
        );
      }

      // Demote the current root (if any) FIRST so the one-root index never sees
      // two roots mid-statement.
      await scoped.update(
        userRoles,
        { role: 'property_manager' },
        eq(userRoles.role, 'root_manager'),
      );

      // Promote the new user.
      await scoped.update(
        userRoles,
        { role: 'root_manager' },
        and(eq(userRoles.userId, newUserId), eq(userRoles.role, 'property_manager')),
      );

      // Resolve any open disputes for this community.
      await scoped.update(
        rootClaimDisputes,
        { status: 'resolved', resolvedAt: new Date(), resolvedBy: admin.id },
        eq(rootClaimDisputes.status, 'open'),
      );
    });
  } catch (err) {
    if (err instanceof ForbiddenReassign) {
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

  await logAuditEvent({
    userId: admin.id,
    action: 'root_reassigned',
    resourceType: 'community',
    resourceId: String(communityId),
    communityId,
    newValues: { root: newUserId },
  });

  return NextResponse.json({ reassigned: true });
}

class ForbiddenReassign extends Error {}
