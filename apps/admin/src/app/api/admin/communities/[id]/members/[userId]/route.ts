/**
 * Individual member management for the admin platform.
 *
 * PATCH  /api/admin/communities/:id/members/:userId — update member role
 * DELETE /api/admin/communities/:id/members/:userId — remove member from community
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { logAdminAction } from '@/lib/audit/log-admin-action';
import { parseJsonBody } from '@/lib/api/parse-body';

interface RouteContext {
  params: Promise<{ id: string; userId: string }>;
}

/**
 * role-v3 (Phase 4.2): the user_roles enum is {resident, property_manager,
 * root_manager} and the preset_key/permissions columns are dropped. Board
 * membership is the orthogonal `designation` column (valid on any role),
 * settable here directly rather than derived from a manager preset.
 *
 * `root_manager` is deliberately ABSENT from this schema.
 *
 * A community has at most one root manager, enforced by a partial unique index.
 * Setting one requires demoting the incumbent FIRST, inside a transaction, so
 * the index never observes two — plus resolving any open `root_claim_disputes`
 * and writing an audit event. `reassignRootOp` (packages/db/src/ops/root-ops.ts)
 * does exactly that; the plain UPDATE this route performs does none of it, and
 * would either 500 on the unique index or silently create a second, unaudited
 * root. Root changes go through POST /api/admin/communities/reassign-root.
 */
const ASSIGNABLE_ROLES = ['resident', 'property_manager'] as const;

const patchSchema = z.object({
  role: z.enum(ASSIGNABLE_ROLES).optional(),
  designation: z.enum(['board_president', 'board_member']).nullable().optional(),
  display_title: z.string().max(200).nullable().optional(),
  is_unit_owner: z.boolean().optional(),
}).strict();

export const PATCH = withAdminErrorHandler(async (request: NextRequest, context: RouteContext) => {
  const admin = await requirePlatformAdmin();

  const { id, userId } = await context.params;
  const communityId = Number(id);
  if (!Number.isInteger(communityId) || communityId <= 0) {
    return NextResponse.json(
      { error: { code: 'INVALID_ID', message: 'Invalid community ID' } },
      { status: 400 },
    );
  }

  const body = await parseJsonBody(request);
  if (body instanceof NextResponse) return body;

  // Give the root_manager rejection its own message. Falling through to the
  // generic Zod enum error would tell an operator only that the value is
  // invalid, not that a dedicated endpoint exists for it.
  if ((body as { role?: unknown } | null)?.role === 'root_manager') {
    return NextResponse.json(
      {
        error: {
          code: 'USE_REASSIGN_ROOT',
          message:
            'Root manager cannot be assigned here. Use POST /api/admin/communities/reassign-root, which demotes the current root atomically and records the change.',
        },
      },
      { status: 400 },
    );
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input' } },
      { status: 400 },
    );
  }

  // Every field is optional, so an empty body passes the schema. Reject it
  // rather than issuing a no-op UPDATE that touches only `updated_at` — that
  // would write a `member_role_changed` audit entry with an empty `newValues`,
  // and an audit trail full of no-op entries is worse than useless.
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'No fields to update.' } },
      { status: 400 },
    );
  }

  const db = createAdminClient();

  // Verify the user_role exists
  const { data: existing } = await db
    .from('user_roles')
    .select('id, role')
    .eq('community_id', communityId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Member not found in this community' } },
      { status: 404 },
    );
  }

  // The incumbent root cannot be DEMOTED here either, for the same reason it
  // cannot be promoted here: a community left with no root manager is exactly
  // the broken state `communities/rootless` exists to surface, and reassignment
  // is the operation that keeps the invariant.
  // `role` can only be one of ASSIGNABLE_ROLES here, so ANY role change
  // requested against the incumbent root is necessarily a demotion.
  if ((existing as { role?: string }).role === 'root_manager' && parsed.data.role !== undefined) {
    return NextResponse.json(
      {
        error: {
          code: 'USE_REASSIGN_ROOT',
          message:
            'This member is the community root manager. Use POST /api/admin/communities/reassign-root to transfer the role rather than demoting them, which would leave the community rootless.',
        },
      },
      { status: 409 },
    );
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      updates[key] = value;
    }
  }

  // A resident does not carry a board designation in this admin surface; clear
  // it when demoting to resident (board designations live on manager-tier rows).
  if (parsed.data.role === 'resident') {
    updates.designation = null;
  }

  const { data: updated, error } = await db
    .from('user_roles')
    .update(updates as never)
    .eq('community_id', communityId)
    .eq('user_id', userId)
    .select('id, user_id, role, designation, display_title, is_unit_owner, created_at, updated_at')
    .single();

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error.message } },
      { status: 500 },
    );
  }

  await logAdminAction({
    admin,
    action: 'member_role_changed',
    resourceType: 'user_role',
    resourceId: userId,
    communityId,
    oldValues: { role: (existing as { role?: string }).role },
    newValues: parsed.data as Record<string, unknown>,
  });

  return NextResponse.json({ member: updated });
});

export const DELETE = withAdminErrorHandler(async (_request: NextRequest, context: RouteContext) => {
  const admin = await requirePlatformAdmin();

  const { id, userId } = await context.params;
  const communityId = Number(id);
  if (!Number.isInteger(communityId) || communityId <= 0) {
    return NextResponse.json(
      { error: { code: 'INVALID_ID', message: 'Invalid community ID' } },
      { status: 400 },
    );
  }

  const db = createAdminClient();

  // Read the row before deleting: the role is needed both to refuse a root
  // deletion and to record what was removed. Deleting the root manager here
  // orphans the community exactly as demoting them would — the PATCH branch
  // above refuses that, and this verb must refuse it too.
  const { data: existing } = await db
    .from('user_roles')
    .select('id, role, designation')
    .eq('community_id', communityId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Member not found in this community' } },
      { status: 404 },
    );
  }

  if ((existing as { role?: string }).role === 'root_manager') {
    return NextResponse.json(
      {
        error: {
          code: 'ROOT_MANAGER_PROTECTED',
          message:
            'This member is the community root manager and cannot be removed directly. Transfer the role with POST /api/admin/communities/reassign-root first.',
        },
      },
      { status: 409 },
    );
  }

  const { data, error } = await db
    .from('user_roles')
    .delete()
    .eq('community_id', communityId)
    .eq('user_id', userId)
    .select('id')
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Member not found in this community' } },
      { status: 404 },
    );
  }

  await logAdminAction({
    admin,
    action: 'member_removed',
    resourceType: 'user_role',
    resourceId: userId,
    communityId,
    oldValues: existing as Record<string, unknown>,
  });

  return NextResponse.json({ success: true });
});
