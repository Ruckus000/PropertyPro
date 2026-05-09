/**
 * Community Contact API
 *
 * GET    /api/v1/community/contact?communityId=N  — read contact info for the community
 * PATCH  /api/v1/community/contact                 — update contact info (admin only)
 *
 * Invariants:
 * - withErrorHandler wrapper (structured errors, request ID)
 * - Tenant isolation via the community-contact service (createScopedClient inside)
 * - Auth via requireAuthenticatedUserId + requireCommunityMembership
 * - Admin check for PATCH (membership.isAdmin)
 * - Audit log on updates with action 'community.contact_updated' (route concern)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { ForbiddenError } from '@/lib/api/errors/ForbiddenError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  getCommunityContact,
  updateCommunityContact,
} from '@/lib/services/community-contact-service';

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

  const data = await getCommunityContact(communityId);
  return NextResponse.json({ data });
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const result = patchSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid contact update payload');
  }

  const communityId = resolveEffectiveCommunityId(req, result.data.communityId);
  await assertNotDemoGrace(communityId);
  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);

  if (!membership.isAdmin) {
    throw new ForbiddenError('Only admins can update contact information');
  }

  const { updateData, contact } = await updateCommunityContact(communityId, {
    contactName: result.data.contactName,
    contactEmail: result.data.contactEmail,
    contactPhone: result.data.contactPhone,
  });

  await logAuditEvent({
    userId,
    action: 'community.contact_updated',
    resourceType: 'community',
    resourceId: String(communityId),
    communityId,
    newValues: updateData,
  });

  return NextResponse.json({ data: contact });
});
