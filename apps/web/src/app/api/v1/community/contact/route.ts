/**
 * Community Contact API
 *
 * GET    /api/v1/community/contact?communityId=N  — read contact info for the community
 * PATCH  /api/v1/community/contact                 — update contact info (admin only)
 *
 * Invariants:
 * - withErrorHandler wrapper (structured errors, request ID)
 * - Tenant isolation via createScopedClient(communityId)
 * - Auth via requireAuthenticatedUserId + requireCommunityMembership
 * - Admin check for PATCH (membership.isAdmin)
 * - Audit log on updates with action 'community.contact_updated'
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createScopedClient,
  communities,
  logAuditEvent,
} from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { ForbiddenError } from '@/lib/api/errors/ForbiddenError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';

const communityIdSchema = z.coerce.number().int().positive();

const patchSchema = z.object({
  communityId: z.number().int().positive(),
  contactName: z.string().nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const parsed = communityIdSchema.safeParse(searchParams.get('communityId'));
  if (!parsed.success) {
    throw new ValidationError('Invalid or missing communityId');
  }

  const communityId = resolveEffectiveCommunityId(req, parsed.data);
  const userId = await requireAuthenticatedUserId();
  await requireCommunityMembership(communityId, userId);

  const scoped = createScopedClient(communityId);
  const rows = await scoped.query(communities);
  const community = rows[0] as Record<string, unknown> | undefined;

  return NextResponse.json({
    data: {
      contactName: (community?.['contactName'] as string | null) ?? null,
      contactEmail: (community?.['contactEmail'] as string | null) ?? null,
      contactPhone: (community?.['contactPhone'] as string | null) ?? null,
    },
  });
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const result = patchSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid contact update payload');
  }

  const communityId = resolveEffectiveCommunityId(req, result.data.communityId);
  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);

  if (!membership.isAdmin) {
    throw new ForbiddenError('Only admins can update contact information');
  }

  const updateData: Record<string, unknown> = {};
  if (result.data.contactName !== undefined) {
    updateData['contactName'] = result.data.contactName;
  }
  if (result.data.contactEmail !== undefined) {
    updateData['contactEmail'] = result.data.contactEmail;
  }
  if (result.data.contactPhone !== undefined) {
    updateData['contactPhone'] = result.data.contactPhone;
  }

  const scoped = createScopedClient(communityId);
  const updated = await scoped.update(
    communities,
    updateData,
    eq(communities.id, communityId),
  );

  await logAuditEvent({
    userId,
    action: 'community.contact_updated',
    resourceType: 'community',
    resourceId: String(communityId),
    communityId,
    newValues: updateData,
  });

  const row = (updated as unknown as Record<string, unknown>[])[0];

  return NextResponse.json({
    data: {
      contactName: (row?.['contactName'] as string | null) ?? null,
      contactEmail: (row?.['contactEmail'] as string | null) ?? null,
      contactPhone: (row?.['contactPhone'] as string | null) ?? null,
    },
  });
});
