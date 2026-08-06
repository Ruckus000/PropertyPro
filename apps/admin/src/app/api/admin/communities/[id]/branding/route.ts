/**
 * Branding API for the admin platform.
 *
 * GET  /api/admin/communities/:id/branding — fetch current branding
 * PATCH /api/admin/communities/:id/branding — update branding fields
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { resolveAndVerifyCommunity } from '@/lib/api/resolve-community';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { assertNoDbError } from '@/lib/api/assert-no-db-error';
import { parseAdminBody } from '@/lib/api/parse-body';
import { brandingSchema } from '@/lib/validation/branding';
import { logAdminAction } from '@/lib/audit/log-admin-action';

const patchSchema = brandingSchema
  .extend({ logoPath: z.string().max(500).optional() })
  .strict();

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const GET = withAdminErrorHandler(async (_request: NextRequest, context: RouteContext) => {
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
});

export const PATCH = withAdminErrorHandler(async (request: NextRequest, context: RouteContext) => {
  const admin = await requirePlatformAdmin();

  const { id } = await context.params;
  const db = createAdminClient();

  const result = await resolveAndVerifyCommunity(id, db);
  if (result instanceof NextResponse) return result;
  const communityId = result;

  const parsed = await parseAdminBody(request, patchSchema);
  if (parsed instanceof NextResponse) return parsed;

  // Fetch current branding to merge
  const { data: current } = await db
    .from('communities')
    .select('branding')
    .eq('id', communityId)
    .single();

  const existingBranding = ((current as Record<string, unknown> | null)?.branding ?? {}) as Record<string, unknown>;

  // Build merged branding
  const merged: Record<string, unknown> = { ...existingBranding };

  for (const [key, value] of Object.entries(parsed)) {
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

  assertNoDbError(error, 'Failed to update community branding');

  await logAdminAction({
    admin,
    action: 'community_branding_changed',
    resourceType: 'community_branding',
    resourceId: communityId,
    communityId,
    oldValues: existingBranding,
    newValues: merged,
  });

  return NextResponse.json({ branding: (updated as Record<string, unknown>).branding ?? {} });
});
