/**
 * Branding API for the admin platform.
 *
 * GET  /api/admin/communities/:id/branding — fetch current branding
 * PATCH /api/admin/communities/:id/branding — update branding fields
 *
 * ## PATCH writes LIVE, and replaces the manager's draft of what it writes
 *
 * Since website builder v4 a community's look is a draft (`branding.draftLook`)
 * that its manager publishes. An admin cannot publish, a support session is
 * read-only, and a rootless community has no manager, so an admin edit saved
 * as a draft might never go live. It is written live instead, through
 * `applyLiveBrandingPatchUnscoped` (packages/db): one atomic UPDATE that also
 * removes any pending draft of the fields written. Without that, a manager's
 * older unpublished colour would put itself back on their next Publish.
 *
 * It used to read the row, merge in JS and write the whole object back, which
 * erased anything the web app wrote in between: the manager's draft, site
 * settings, the asset quota.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { resolveAndVerifyCommunity } from '@/lib/api/resolve-community';
import { createAdminClient } from '@propertypro/db/supabase/admin';
// AUTHZ: platform-admin branding write — applyLiveBrandingPatchUnscoped writes any community by id; requirePlatformAdmin() runs first in the handler below.
import { applyLiveBrandingPatchUnscoped } from '@propertypro/db/unsafe';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
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

  const { before, after } = await applyLiveBrandingPatchUnscoped(communityId, parsed, {
    touchUpdatedAt: true,
  });
  if (after === null) {
    // resolveAndVerifyCommunity found it a moment ago; it is gone now.
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Community not found' } },
      { status: 404 },
    );
  }

  await logAdminAction({
    admin,
    action: 'community_branding_changed',
    resourceType: 'community_branding',
    resourceId: communityId,
    communityId,
    oldValues: (before ?? {}) as Record<string, unknown>,
    newValues: after as Record<string, unknown>,
  });

  return NextResponse.json({ branding: after });
});
