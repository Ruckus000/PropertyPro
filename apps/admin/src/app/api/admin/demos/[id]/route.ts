/**
 * Demo instance API — get and delete individual demos.
 *
 * GET    /api/admin/demos/:id — returns a single demo instance
 * DELETE /api/admin/demos/:id — retires a demo: soft-deletes it and its community, bans its users
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import {
  getDemoById,
  getDemoByIdWithConversionState,
  softDeleteDemo,
  updateDemo,
  sanitizeDemoRow,
} from '@/lib/db/demo-queries';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { assertNoDbError } from '@/lib/api/assert-no-db-error';
import { logAdminAction } from '@/lib/audit/log-admin-action';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const GET = withAdminErrorHandler(async (_request: Request, context: RouteContext) => {
  await requirePlatformAdmin();

  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'id must be a positive integer' } },
      { status: 400 },
    );
  }

  const { data, error } = await getDemoById(id);

  assertNoDbError(error, 'Failed to read demo instance');

  if (!data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Demo not found' } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: sanitizeDemoRow(data) });
});

export const DELETE = withAdminErrorHandler(async (_request: Request, context: RouteContext) => {
  const admin = await requirePlatformAdmin();

  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'id must be a positive integer' } },
      { status: 400 },
    );
  }

  // 1. Look up the demo instance with conversion state
  const { data: demo, error: fetchError } = await getDemoByIdWithConversionState(id);
  if (fetchError || !demo) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Demo not found' } },
      { status: 404 },
    );
  }

  // 2. Refuse to delete a demo whose community has been converted to a real
  // customer. The community row still references this demo via
  // seeded_community_id, and retiring it would take a paying customer offline.
  if (demo.is_converted) {
    return NextResponse.json(
      {
        error: {
          code: 'DEMO_ALREADY_CONVERTED',
          message:
            'This demo has been converted to a customer community. Delete the demo_instances row directly without cascading the community.',
        },
      },
      { status: 409 },
    );
  }

  // 3. Retire it the way the expire-demos cron does. This used to hard-delete
  // the auth users first (errors swallowed), then the community and demo row
  // (errors discarded) — and conversion_events' NO ACTION FKs block both
  // deletes, so every attempt left a live demo whose logins were gone.
  const { error: softDeleteError } = await softDeleteDemo(
    id,
    demo.seeded_community_id,
    new Date().toISOString(),
  );
  assertNoDbError(softDeleteError, 'Failed to delete demo instance');

  // 4. Ban the demo logins (876600h, the cron's value). updateUserById reports
  // failure in its return value rather than throwing, so it is read, not
  // caught. A user that no longer exists cannot sign in, so 404 is fine.
  const supabase = createAdminClient();
  const userIds = [demo.demo_resident_user_id, demo.demo_board_user_id].filter(Boolean) as string[];
  const banFailures: string[] = [];
  for (const userId of userIds) {
    const { error } = await supabase.auth.admin.updateUserById(userId, { ban_duration: '876600h' });
    if (error && error.status !== 404) banFailures.push(userId);
  }

  // The community and demo rows survive (soft-deleted), so this entry keeps a
  // live community_id. Logged even when a ban failed: the soft delete DID
  // happen, and an admin who never retries must still leave a record.
  await logAdminAction({
    admin,
    action: 'demo_deleted',
    resourceType: 'demo_instance',
    resourceId: id,
    communityId: demo.seeded_community_id ?? null,
    oldValues: {
      slug: demo.slug,
      seeded_community_id: demo.seeded_community_id,
      demo_resident_user_id: demo.demo_resident_user_id,
      demo_board_user_id: demo.demo_board_user_id,
    },
    metadata: {
      soft_deleted: true,
      banned_auth_user_count: userIds.length - banFailures.length,
      ban_failed_user_ids: banFailures,
    },
  });

  if (banFailures.length > 0) {
    // Retrying is safe: the soft delete is idempotent and the ban is re-applied.
    return NextResponse.json(
      {
        error: {
          code: 'DEMO_USER_BAN_FAILED',
          message: 'The demo was removed, but its logins could not all be disabled. Try again.',
        },
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
});

export const PATCH = withAdminErrorHandler(async (request: Request, context: RouteContext) => {
  await requirePlatformAdmin();

  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'id must be a positive integer' } },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  const schema = z.object({
    prospect_name: z.string().min(1).max(255).optional(),
    external_crm_url: z.string().url().max(2048).nullable().optional(),
    prospect_notes: z.string().max(4000).nullable().optional(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((e) => e.message).join(', '),
        },
      },
      { status: 400 },
    );
  }

  // Ensure at least one field is being updated
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'No fields provided to update' } },
      { status: 400 },
    );
  }

  const { data, error } = await updateDemo(id, parsed.data);

  assertNoDbError(error, 'Failed to update demo instance');

  if (!data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Demo not found' } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: sanitizeDemoRow(data) });
});
