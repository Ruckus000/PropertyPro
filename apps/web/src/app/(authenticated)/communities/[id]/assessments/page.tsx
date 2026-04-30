import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Legacy URL: /communities/[id]/assessments → finance dashboard Assessments tab.
 */
export default async function AssessmentsRedirectPage({ params }: PageProps) {
  const { id } = await params;
  const communityId = Number(id);

  if (!Number.isFinite(communityId) || communityId <= 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold text-content">Assessments</h1>
        <p className="mt-2 text-sm text-status-danger">Invalid community ID</p>
      </div>
    );
  }

  redirect(`/communities/${communityId}/finance?tab=assessments`);
}
