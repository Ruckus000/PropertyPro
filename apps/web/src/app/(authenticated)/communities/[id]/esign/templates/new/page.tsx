import { redirect } from 'next/navigation';
import { requireAuthenticatedUser } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { checkPermission } from '@propertypro/shared';
import * as esignService from '@/lib/services/esign-service';
import { EsignBuilder } from '@/components/esign/EsignBuilder';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NewTemplatePage({ params }: PageProps) {
  const { id } = await params;
  const communityId = Number(id);

  const user = await requireAuthenticatedUser();
  const membership = await requireCommunityMembership(communityId, user.id);

  if (!checkPermission(membership.role, membership.communityType, 'esign', 'write')) {
    redirect(`/communities/${communityId}/esign?communityId=${communityId}`);
  }

  // Generate a short-lived JWT for the builder using the authenticated user's email
  const token = esignService.getBuilderToken(
    communityId,
    user.email ?? 'unknown@propertyprofl.com',
    'New Template',
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create Template</h1>
        <p className="text-sm text-gray-500">
          Design your e-signature template using the builder below
        </p>
      </div>
      <EsignBuilder token={token} />
    </div>
  );
}
