/**
 * Community management API for the admin platform.
 *
 * GET  /api/admin/communities/:id — fetch full community details
 * PATCH /api/admin/communities/:id — update community metadata & settings
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { PLAN_IDS } from '@propertypro/shared';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { assertNoDbError } from '@/lib/api/assert-no-db-error';
import { parseAdminBody } from '@/lib/api/parse-body';
import { logAdminAction } from '@/lib/audit/log-admin-action';

const writeLevel = z.enum(['all_members', 'admin_only']);

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  address_line1: z.string().max(500).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state: z.string().max(2).nullable().optional(),
  zip_code: z.string().max(10).nullable().optional(),
  timezone: z.string().min(1).max(100).optional(),
  subscription_plan: z.enum(PLAN_IDS).nullable().optional(),
  subscription_status: z.enum(['active', 'trialing', 'past_due', 'canceled']).nullable().optional(),
  transparency_enabled: z.boolean().optional(),
  community_settings: z.object({
    announcementsWriteLevel: writeLevel.optional(),
    meetingsWriteLevel: writeLevel.optional(),
    meetingDocumentsWriteLevel: writeLevel.optional(),
    unitsWriteLevel: writeLevel.optional(),
    leasesWriteLevel: writeLevel.optional(),
    documentCategoriesWriteLevel: writeLevel.optional(),
    electionsAttorneyReviewed: z.boolean().optional(),
    violationFinesEnabled: z.boolean().optional(),
    assessmentPaymentsEnabled: z.boolean().optional(),
    smsDispatchEnabled: z.boolean().optional(),
    noticePdfGenerationEnabled: z.boolean().optional(),
  }).optional(),
}).strict();

/**
 * Per-community legal gates — every one of these controls a feature that carries
 * statutory or regulatory exposure, so each flip is audited individually with its
 * own `community_settings_changed` event.
 *
 * Keep in sync with the `communitySettings` `$type<>` union in
 * packages/db/src/schema/communities.ts and the hydration in
 * apps/web/src/lib/api/community-membership.ts.
 * See docs/audits/2026-08-09-legal-risk-audit.md §2a.
 */
const LEGAL_GATE_KEYS = [
  'electionsAttorneyReviewed',
  'violationFinesEnabled',
  'assessmentPaymentsEnabled',
  'smsDispatchEnabled',
  'noticePdfGenerationEnabled',
] as const;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const GET = withAdminErrorHandler(async (_request: NextRequest, context: RouteContext) => {
  await requirePlatformAdmin();

  const { id } = await context.params;
  const communityId = Number(id);
  if (!Number.isInteger(communityId) || communityId <= 0) {
    return NextResponse.json(
      { error: { code: 'INVALID_ID', message: 'Invalid community ID' } },
      { status: 400 },
    );
  }

  const db = createAdminClient();

  const { data, error } = await db
    .from('communities')
    .select('id, name, slug, community_type, timezone, address_line1, address_line2, city, state, zip_code, subscription_plan, subscription_status, transparency_enabled, community_settings, custom_domain, is_demo, created_at, updated_at')
    .eq('id', communityId)
    .is('deleted_at', null)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Community not found' } },
      { status: 404 },
    );
  }

  if ((data as Record<string, unknown>).is_demo) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Community not found' } },
      { status: 404 },
    );
  }

  return NextResponse.json({ community: data });
});

export const PATCH = withAdminErrorHandler(async (request: NextRequest, context: RouteContext) => {
  const admin = await requirePlatformAdmin();

  const { id } = await context.params;
  const communityId = Number(id);
  if (!Number.isInteger(communityId) || communityId <= 0) {
    return NextResponse.json(
      { error: { code: 'INVALID_ID', message: 'Invalid community ID' } },
      { status: 400 },
    );
  }

  const parsed = await parseAdminBody(request, patchSchema);
  if (parsed instanceof NextResponse) return parsed;

  const db = createAdminClient();

  // Verify community exists and is not a demo; also fetch current settings for audit diff
  const { data: existing } = await db
    .from('communities')
    .select('id, is_demo, community_settings')
    .eq('id', communityId)
    .is('deleted_at', null)
    .single();

  if (!existing || (existing as Record<string, unknown>).is_demo) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Community not found' } },
      { status: 404 },
    );
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  const { community_settings, ...rest } = parsed;
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) {
      updates[key] = value;
    }
  }
  if (community_settings !== undefined) {
    updates.community_settings = community_settings;
  }

  const { data: updated, error } = await db
    .from('communities')
    .update(updates as never)
    .eq('id', communityId)
    .select('id, name, slug, community_type, timezone, address_line1, city, state, zip_code, subscription_plan, subscription_status, transparency_enabled, community_settings, created_at, updated_at')
    .single();

  assertNoDbError(error, 'Failed to update community');

  // Audit every legal-readiness gate with its own settings_changed event.
  //
  // One event PER CHANGED KEY, not one per request: each of these authorizes a
  // distinct legally-exposed capability, and "who turned fines back on, and when"
  // has to be answerable on its own. The per-key event shape (including the
  // `settingName` / `oldValue` / `newValue` metadata) is preserved exactly as it
  // was when only `electionsAttorneyReviewed` existed, so existing consumers of
  // that event keep working.
  if (community_settings !== undefined) {
    const oldSettings = ((existing as Record<string, unknown>).community_settings ?? {}) as Record<
      string,
      unknown
    >;
    const nextSettings = community_settings as Record<string, unknown>;

    for (const key of LEGAL_GATE_KEYS) {
      // A key absent from the PATCH body is UNCHANGED, not "set to false" — the
      // update merges. Skip it rather than logging a phantom flip to false.
      if (nextSettings[key] === undefined) continue;

      const oldValue = oldSettings[key] === true;
      const newValue = nextSettings[key] === true;
      if (oldValue === newValue) continue;

      // Was a DYNAMIC import of logAuditEvent from '@propertypro/db' — the
      // only such import in apps/admin — done that way purely to defer
      // drizzle.ts's module-load throw on a missing DATABASE_URL to request
      // time. logAdminAction goes through the service-role PostgREST client
      // that the rest of this app already uses, so the hazard is gone.
      await logAdminAction({
        admin,
        action: 'community_settings_changed',
        resourceType: 'community_settings',
        resourceId: communityId,
        communityId,
        oldValues: { [key]: oldValue },
        newValues: { [key]: newValue },
        metadata: { settingName: key, oldValue, newValue },
      });
    }
  }

  return NextResponse.json({ community: updated });
});
