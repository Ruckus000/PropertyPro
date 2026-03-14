/**
 * Branding API for the admin platform.
 *
 * GET  /api/admin/communities/:id/branding — fetch current branding
 * PATCH /api/admin/communities/:id/branding — update branding fields
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { isValidHexColor } from '@propertypro/shared';
import { ALLOWED_FONTS } from '@propertypro/theme';

const HEX_COLOR = z.string().refine(isValidHexColor, { message: 'Must be a valid hex color (e.g. #2563EB)' });
const FONT = z.string().refine(
  (f) => (ALLOWED_FONTS as readonly string[]).includes(f),
  { message: 'Font not in allowed list' },
);

const patchSchema = z.object({
  primaryColor: HEX_COLOR.optional(),
  secondaryColor: HEX_COLOR.optional(),
  accentColor: HEX_COLOR.optional(),
  fontHeading: FONT.optional(),
  fontBody: FONT.optional(),
  logoStoragePath: z.string().max(500).optional(),
}).strict();

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Validate the community ID param, verify community exists and is not a demo.
 * Returns the numeric ID or a NextResponse error.
 */
async function resolveAndVerifyCommunity(
  rawId: string,
  db: ReturnType<typeof createAdminClient>,
): Promise<number | NextResponse> {
  const communityId = Number(rawId);
  if (!Number.isInteger(communityId) || communityId <= 0) {
    return NextResponse.json(
      { error: { code: 'INVALID_ID', message: 'Invalid community ID' } },
      { status: 400 },
    );
  }

  const { data } = await db
    .from('communities')
    .select('id, is_demo')
    .eq('id', communityId)
    .is('deleted_at', null)
    .single();

  if (!data || (data as Record<string, unknown>).is_demo) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Community not found' } },
      { status: 404 },
    );
  }

  return communityId;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  await requirePlatformAdmin();

  const { id } = await context.params;
  const db = createAdminClient();

  const result = await resolveAndVerifyCommunity(id, db);
  if (result instanceof NextResponse) return result;
  const communityId = result;

  const { data, error } = await db
    .from('communities')
    .select('branding')
    .eq('id', communityId)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch branding' } },
      { status: 500 },
    );
  }

  return NextResponse.json({ branding: (data as Record<string, unknown>).branding ?? {} });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  await requirePlatformAdmin();

  const { id } = await context.params;
  const db = createAdminClient();

  const result = await resolveAndVerifyCommunity(id, db);
  if (result instanceof NextResponse) return result;
  const communityId = result;

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input' } },
      { status: 400 },
    );
  }

  // Fetch current branding to merge
  const { data: current } = await db
    .from('communities')
    .select('branding')
    .eq('id', communityId)
    .single();

  const existingBranding = ((current as Record<string, unknown> | null)?.branding ?? {}) as Record<string, unknown>;

  // Build merged branding
  const { logoStoragePath, ...colorFontFields } = parsed.data;
  const merged: Record<string, unknown> = { ...existingBranding };

  for (const [key, value] of Object.entries(colorFontFields)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  // If a new logo was uploaded, store its path
  if (logoStoragePath !== undefined) {
    merged.logoPath = logoStoragePath;
  }

  const { data: updated, error } = await db
    .from('communities')
    .update({ branding: merged, updated_at: new Date().toISOString() } as never)
    .eq('id', communityId)
    .select('branding')
    .single();

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ branding: (updated as Record<string, unknown>).branding ?? {} });
}
