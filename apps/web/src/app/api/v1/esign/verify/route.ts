import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { logAuditEvent } from '@propertypro/db';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const url = new URL(req.url);
  const communityId = Number(url.searchParams.get('communityId'));
  const effectiveCommunityId = resolveEffectiveCommunityId(req, communityId);
  const membership = await requireCommunityMembership(effectiveCommunityId, userId);
  requirePermission(membership.role, membership.communityType, 'esign', 'read');

  const formData = await req.formData() as unknown as globalThis.FormData;
  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    throw new ValidationError('A PDF file is required');
  }

  // Forward to DocuSeal verification endpoint
  const apiKey = process.env.DOCUSEAL_API_KEY;
  const apiUrl = process.env.DOCUSEAL_API_URL || 'https://api.docuseal.com';

  const dsFormData = new FormData();
  dsFormData.append('file', file);

  const response = await fetch(`${apiUrl}/tools/verify`, {
    method: 'POST',
    headers: { 'X-Auth-Token': apiKey! },
    body: dsFormData,
  });

  if (!response.ok) {
    throw new ValidationError('Document verification failed');
  }

  const result = await response.json();

  await logAuditEvent({
    userId,
    action: 'esign_document_verified',
    resourceType: 'esign_document',
    resourceId: file.name,
    communityId: effectiveCommunityId,
    metadata: { verified: result.valid ?? false },
  });

  return NextResponse.json({ data: result });
});
