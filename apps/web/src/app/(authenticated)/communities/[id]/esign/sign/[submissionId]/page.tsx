import { redirect } from 'next/navigation';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import * as esignService from '@/lib/services/esign-service';
import { EsignSigningPage } from './EsignSigningPage';

interface PageProps {
  params: Promise<{ id: string; submissionId: string }>;
}

export default async function SignPage({ params }: PageProps) {
  const { id, submissionId } = await params;
  const communityId = Number(id);

  const userId = await requireAuthenticatedUserId();
  await requireCommunityMembership(communityId, userId);

  const submission = await esignService.getSubmission(
    communityId,
    Number(submissionId),
  );

  if (!submission) {
    redirect(`/communities/${communityId}/esign?communityId=${communityId}`);
  }

  const slug = await esignService.getSignerSlug(
    communityId,
    Number(submissionId),
    userId,
  );

  const signers = await esignService.getSubmissionSigners(
    communityId,
    Number(submissionId),
  );

  return (
    <EsignSigningPage
      communityId={communityId}
      submissionId={Number(submissionId)}
      slug={slug}
      submission={submission}
      signers={signers}
    />
  );
}
