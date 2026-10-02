/**
 * Demo branding API — read/update the seeded community's branding.
 *
 * GET  /api/admin/demos/:id/community/branding — fetch current branding
 * PATCH /api/admin/demos/:id/community/branding — update colors, fonts, logo
 *
 * PATCH writes live through `applyLiveBrandingPatchUnscoped`, the same atomic
 * op as the real-community route (see that route for why). A demo's manager
 * can save a design draft in the web editor too, so the same two defects
 * applied here: a lost concurrent write, and a stale draft reverting the
 * admin's change on Publish.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { getDemoCommunityId, markDemoCustomized } from '@/lib/db/demo-queries';
import { createAdminClient } from '@propertypro/db/supabase/admin';
// AUTHZ: platform-admin branding write — applyLiveBrandingPatchUnscoped writes any community by id; requirePlatformAdmin() runs first in the handler below.
import { applyLiveBrandingPatchUnscoped } from '@propertypro/db/unsafe';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { brandingSchema } from '@/lib/validation/branding';
import { parseAdminBody } from '@/lib/api/parse-body';
import { logAdminAction } from '@/lib/audit/log-admin-action';


const patchSchema = z.object({
  ...brandingSchema.shape,
  logoPath: z.string().max(500).optional(),
}).strict();

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const GET = withAdminErrorHandler(async (_request: NextRequest, context: RouteContext) => {
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
});

export const PATCH = withAdminErrorHandler(async (request: NextRequest, context: RouteContext) => {
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

  const parsed = await parseAdminBody(request, patchSchema);
  if (parsed instanceof NextResponse) return parsed;

  const { before, after } = await applyLiveBrandingPatchUnscoped(communityId, parsed, {
    touchUpdatedAt: true,
  });
  if (after === null) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Demo not found' } },
      { status: 404 },
    );
  }

  // Mark demo as customized (no-op if already set)
  await markDemoCustomized(demoId);

  await logAdminAction({
    admin,
    action: 'demo_branding_changed',
    resourceType: 'community_branding',
    resourceId: communityId,
    communityId,
    oldValues: (before ?? {}) as Record<string, unknown>,
    newValues: after as Record<string, unknown>,
    metadata: { source: 'admin_platform', demo_id: demoId },
  });

  return NextResponse.json({ branding: after });
});
