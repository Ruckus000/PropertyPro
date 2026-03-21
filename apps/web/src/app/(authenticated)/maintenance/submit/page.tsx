/**
 * Maintenance Request Submission — P3-50
 *
 * Route: /maintenance/submit?communityId=X
 * Auth: any community member (all roles can submit)
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { getEffectiveFeaturesForPage } from '@/lib/middleware/plan-guard';
import { createScopedClient, maintenanceRequests, maintenanceComments } from '@propertypro/db';
import { and, eq, inArray } from '@propertypro/db/filters';
import { SubmitForm } from '@/components/maintenance/SubmitForm';
import { RequestCard } from '@/components/maintenance/RequestCard';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function MaintenanceSubmitPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawId = Number(params['communityId']);

  if (!Number.isInteger(rawId) || rawId <= 0) {
    redirect('/dashboard?reason=invalid-selection');
  }

  const communityId = rawId;
  let userId: string;

  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  const membership = await requireCommunityMembership(communityId, userId);

  // Feature gate — redirect if maintenance requests are not enabled for this community type/plan
  const features = await getEffectiveFeaturesForPage(communityId, membership.communityType);
  if (!features.hasMaintenanceRequests) {
    redirect('/dashboard?reason=feature-not-available');
  }

  // Fetch the user's own requests server-side for initial render
  const scoped = createScopedClient(communityId);
  const allRequests = await scoped.selectFrom(
    maintenanceRequests,
    {},
    eq(maintenanceRequests.submittedById, userId),
  );
  const ownRequests = (allRequests as unknown as Record<string, unknown>[]).sort(
    (a, b) =>
      new Date(b['createdAt'] as string).getTime() -
      new Date(a['createdAt'] as string).getTime(),
  );

  // Batch-fetch all comments for these requests in one query — avoids per-card client round-trips
  const requestIds = ownRequests.map((r) => r['id'] as number);
  const allComments = requestIds.length > 0
    ? await scoped.selectFrom(
        maintenanceComments,
        {},
        and(
          inArray(maintenanceComments.requestId, requestIds),
          eq(maintenanceComments.isInternal, false),
        ),
      ) as unknown as Record<string, unknown>[]
    : [];
  const commentsByRequestId = new Map<number, Record<string, unknown>[]>();
  for (const c of allComments) {
    const rid = c['requestId'] as number;
    const bucket = commentsByRequestId.get(rid) ?? [];
    bucket.push(c);
    commentsByRequestId.set(rid, bucket);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-content">Maintenance Requests</h1>
        <p className="mt-1 text-sm text-content-secondary">
          Submit a new request or view the status of existing ones.
        </p>
      </div>

      <SubmitForm communityId={communityId} userId={userId} />

      {ownRequests.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-lg font-medium text-content">Your Requests</h2>
          <div className="space-y-3">
            {ownRequests.map((r) => (
              <RequestCard
                key={r['id'] as number}
                communityId={communityId}
                request={{
                  id: r['id'] as number,
                  communityId: r['communityId'] as number,
                  unitId: (r['unitId'] as number | null) ?? null,
                  submittedById: r['submittedById'] as string,
                  title: r['title'] as string,
                  description: r['description'] as string,
                  status: r['status'] as string,
                  priority: r['priority'] as string,
                  category: (r['category'] as string) ?? 'general',
                  assignedToId: (r['assignedToId'] as string | null) ?? null,
                  resolutionDescription: (r['resolutionDescription'] as string | null) ?? null,
                  resolutionDate: (r['resolutionDate'] as string | null) ?? null,
                  photos: null,
                  createdAt: r['createdAt'] as string,
                  updatedAt: r['updatedAt'] as string,
                  comments: (commentsByRequestId.get(r['id'] as number) ?? []).map((c) => ({
                    id: c['id'] as number,
                    requestId: c['requestId'] as number,
                    userId: c['userId'] as string,
                    text: c['text'] as string,
                    isInternal: c['isInternal'] as boolean,
                    createdAt: c['createdAt'] as string,
                  })),
                }}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
