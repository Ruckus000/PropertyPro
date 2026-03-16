/**
 * Demo branding API — read/update the seeded community's branding.
 *
 * GET  /api/admin/demos/:id/community/branding — fetch current branding
 * PATCH /api/admin/demos/:id/community/branding — update colors, fonts, logo
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { getDemoCommunityId, markDemoCustomized } from '@/lib/db/demo-queries';
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
  logoPath: z.string().max(500).optional(),
}).strict();

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  await requirePlatformAdmin();

  const { id: idRaw } = await context.params;
  const demoId = Number(idRaw);
  if (!Number.isInteger(demoId) || demoId <= 0) {
    return NextResponse.json(
      { error: { code: 'INVALID_ID', message: 'Invalid demo ID' } },
      { status: 400 },
    );
  }

  const communityId = await getDemoCommunityId(demoId);
  if (!communityId) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Demo not found' } },
      { status: 404 },
    );
  }

  const db = createAdminClient();
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
  const admin = await requirePlatformAdmin();

  const { id: idRaw } = await context.params;
  const demoId = Number(idRaw);
  if (!Number.isInteger(demoId) || demoId <= 0) {
    return NextResponse.json(
      { error: { code: 'INVALID_ID', message: 'Invalid demo ID' } },
      { status: 400 },
    );
  }

  const communityId = await getDemoCommunityId(demoId);
  if (!communityId) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Demo not found' } },
      { status: 404 },
    );
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input' } },
      { status: 400 },
    );
  }

  const db = createAdminClient();

  // Fetch current branding to merge (partial update)
  const { data: current } = await db
    .from('communities')
    .select('branding')
    .eq('id', communityId)
    .single();

  const existingBranding = ((current as Record<string, unknown> | null)?.branding ?? {}) as Record<string, unknown>;

  // Build merged branding
  const merged: Record<string, unknown> = { ...existingBranding };

  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      merged[key] = value;
    }
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

  // Mark demo as customized (no-op if already set)
  await markDemoCustomized(demoId);

  // Fire-and-forget audit log
  db.from('compliance_audit_log')
    .insert({
      user_id: admin.id,
      community_id: communityId,
      action: 'demo_branding_changed',
      resource_type: 'community_branding',
      resource_id: String(communityId),
      old_values: existingBranding,
      new_values: merged,
      metadata: { source: 'admin_platform', admin_email: admin.email, demo_id: demoId },
    } as never)
    .then(({ error: auditError }) => {
      if (auditError) {
        console.error('[audit] Failed to log demo branding change:', auditError.message);
      }
    });

  return NextResponse.json({ branding: (updated as Record<string, unknown>).branding ?? {} });
}
