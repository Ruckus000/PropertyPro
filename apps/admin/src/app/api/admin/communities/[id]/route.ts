/**
 * Community management API for the admin platform.
 *
 * GET  /api/admin/communities/:id — fetch full community details
 * PATCH /api/admin/communities/:id — update community metadata & settings
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';

const writeLevel = z.enum(['all_members', 'admin_only']);

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  address_line1: z.string().max(500).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state: z.string().max(2).nullable().optional(),
  zip_code: z.string().max(10).nullable().optional(),
  timezone: z.string().min(1).max(100).optional(),
  subscription_plan: z.string().max(100).nullable().optional(),
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
  }).optional(),
}).strict();

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
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
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = await requirePlatformAdmin();

  const { id } = await context.params;
  const communityId = Number(id);
  if (!Number.isInteger(communityId) || communityId <= 0) {
    return NextResponse.json(
      { error: { code: 'INVALID_ID', message: 'Invalid community ID' } },
      { status: 400 },
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

  const { community_settings, ...rest } = parsed.data;
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

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error.message } },
      { status: 500 },
    );
  }

  // Audit the legal-readiness gate with a dedicated settings_changed event.
  if (community_settings !== undefined) {
    const oldSettings = (existing as Record<string, unknown>).community_settings ?? {};
    const oldAttorneyReviewed = (oldSettings as Record<string, unknown>).electionsAttorneyReviewed === true;
    const nextAttorneyReviewed = community_settings.electionsAttorneyReviewed === true;
    if (oldAttorneyReviewed !== nextAttorneyReviewed) {
      const { logAuditEvent } = await import('@propertypro/db');
      await logAuditEvent({
        userId: admin.id,
        action: 'settings_changed',
        resourceType: 'community_settings',
        resourceId: String(communityId),
        communityId,
        oldValues: { electionsAttorneyReviewed: oldAttorneyReviewed },
        newValues: { electionsAttorneyReviewed: nextAttorneyReviewed },
        metadata: {
          settingName: 'electionsAttorneyReviewed',
          oldValue: oldAttorneyReviewed,
          newValue: nextAttorneyReviewed,
        },
      });
    }
  }

  return NextResponse.json({ community: updated });
}
