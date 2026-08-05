/**
 * Demo instance API — get and delete individual demos.
 *
 * GET    /api/admin/demos/:id — returns a single demo instance
 * DELETE /api/admin/demos/:id — hard-deletes a demo instance + community + auth users
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import {
  getDemoById,
  getDemoByIdWithConversionState,
  deleteDemo,
  deleteCommunity,
  updateDemo,
  sanitizeDemoRow,
} from '@/lib/db/demo-queries';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';

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

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error.message } },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Demo not found' } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: sanitizeDemoRow(data) });
});

export const DELETE = withAdminErrorHandler(async (_request: Request, context: RouteContext) => {
  await requirePlatformAdmin();

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
  // seeded_community_id, but cascading the delete would wipe live tenant data.
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

  // 3. Delete demo users from Supabase Auth
  const supabase = createAdminClient();
  const userIds = [demo.demo_resident_user_id, demo.demo_board_user_id].filter(Boolean) as string[];
  for (const userId of userIds) {
    try {
      await supabase.auth.admin.deleteUser(userId);
    } catch {
      // User may already be deleted — continue
    }
  }

  // 4. Delete the community (cascades demo data)
  if (demo.seeded_community_id) {
    await deleteCommunity(demo.seeded_community_id);
  }

  // 5. Delete the demo_instances row
  const { error: deleteError } = await deleteDemo(id);
  if (deleteError) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: deleteError.message } },
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

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error.message } },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Demo not found' } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: sanitizeDemoRow(data) });
});
