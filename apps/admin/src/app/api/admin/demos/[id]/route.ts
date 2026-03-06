/**
 * Demo instance API — get, update, and delete individual demos.
 *
 * GET    /api/admin/demos/:id — returns a single demo instance
 * PATCH  /api/admin/demos/:id — partial-update editable fields + sync community branding
 * DELETE /api/admin/demos/:id — hard-deletes a demo instance + community + auth users
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { isValidHexColor } from '@propertypro/shared';
import { ALLOWED_FONTS } from '@propertypro/theme';
import {
  getDemoById,
  updateDemo,
  updateCommunityBranding,
  deleteDemo,
  deleteCommunity,
} from '@/lib/db/demo-queries';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Shared id validation
// ---------------------------------------------------------------------------

function parseId(idRaw: string): number | null {
  const id = Number(idRaw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// ---------------------------------------------------------------------------
// PATCH schema
// ---------------------------------------------------------------------------

const HEX_COLOR = z.string().refine(isValidHexColor, { message: 'Must be a hex color (#RRGGBB)' });

const patchDemoSchema = z.object({
  prospectName: z.string().min(1).max(100).optional(),
  theme: z
    .object({
      primaryColor: HEX_COLOR,
      secondaryColor: HEX_COLOR,
      accentColor: HEX_COLOR,
      fontHeading: z.string().refine((f) => (ALLOWED_FONTS as readonly string[]).includes(f), {
        message: 'Font not in allowed list',
      }),
      fontBody: z.string().refine((f) => (ALLOWED_FONTS as readonly string[]).includes(f), {
        message: 'Font not in allowed list',
      }),
      logoPath: z.string().optional(),
    })
    .optional(),
  externalCrmUrl: z.string().url().optional().or(z.literal('')).or(z.null()),
  prospectNotes: z.string().max(2000).optional().or(z.literal('')).or(z.null()),
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(_request: Request, context: RouteContext) {
  await requirePlatformAdmin();

  const id = parseId((await context.params).id);
  if (!id) {
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

  return NextResponse.json({ data });
}

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

export async function PATCH(request: Request, context: RouteContext) {
  await requirePlatformAdmin();

  const id = parseId((await context.params).id);
  if (!id) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'id must be a positive integer' } },
      { status: 400 },
    );
  }

  // Parse & validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  const parsed = patchDemoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input' } },
      { status: 400 },
    );
  }

  const { prospectName, theme, externalCrmUrl, prospectNotes } = parsed.data;

  // Look up existing demo
  const { data: demo, error: fetchError } = await getDemoById(id);
  if (fetchError || !demo) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Demo not found' } },
      { status: 404 },
    );
  }

  // Build update payload
  const updates: Record<string, unknown> = {};
  if (prospectName !== undefined) updates.prospect_name = prospectName;
  if (theme !== undefined) updates.theme = theme;
  if (externalCrmUrl !== undefined) updates.external_crm_url = externalCrmUrl || null;
  if (prospectNotes !== undefined) updates.prospect_notes = prospectNotes || null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ data: demo });
  }

  // Update demo instance
  const { data: updated, error: updateError } = await updateDemo(id, updates);
  if (updateError) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: updateError.message } },
      { status: 500 },
    );
  }

  // Sync name + branding to the community so live previews reflect changes
  if (demo.seeded_community_id && (prospectName || theme)) {
    const communityUpdates: { name?: string; branding?: Record<string, unknown> } = {};
    if (prospectName) communityUpdates.name = prospectName;
    if (theme) communityUpdates.branding = theme;
    await updateCommunityBranding(demo.seeded_community_id, communityUpdates);
  }

  return NextResponse.json({ data: updated });
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

export async function DELETE(_request: Request, context: RouteContext) {
  await requirePlatformAdmin();

  const id = parseId((await context.params).id);
  if (!id) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'id must be a positive integer' } },
      { status: 400 },
    );
  }

  // 1. Look up the demo instance
  const { data: demo, error: fetchError } = await getDemoById(id);
  if (fetchError || !demo) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Demo not found' } },
      { status: 404 },
    );
  }

  // 2. Delete demo users from Supabase Auth
  const supabase = createAdminClient();
  const userIds = [demo.demo_resident_user_id, demo.demo_board_user_id].filter(Boolean) as string[];
  for (const userId of userIds) {
    try {
      await supabase.auth.admin.deleteUser(userId);
    } catch {
      // User may already be deleted — continue
    }
  }

  // 3. Delete the community (cascades demo data)
  if (demo.seeded_community_id) {
    await deleteCommunity(demo.seeded_community_id);
  }

  // 4. Delete the demo_instances row
  const { error: deleteError } = await deleteDemo(id);
  if (deleteError) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: deleteError.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
