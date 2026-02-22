/**
 * PM Portfolio Dashboard — Communities List (P3-45)
 *
 * Server-rendered page listing all communities managed by the authenticated PM.
 * - Auth enforced via requireAuthenticatedUserId (server-side)
 * - PM role enforced via isPmAdminInAnyCommunity
 * - Filtering is server-authoritative (communityType + search via URL params)
 * - Safe empty state when PM has zero managed communities
 */
import { redirect } from 'next/navigation';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { isPmAdminInAnyCommunity, listManagedCommunitiesForPm } from '@/lib/api/pm-communities';
import type { PmCommunityFilters } from '@/lib/api/pm-communities';
import { CommunityCard } from '@/components/pm/CommunityCard';
import { CommunityFilters } from '@/components/pm/CommunityFilters';
import type { CommunityType } from '@propertypro/shared';

interface CommunitiesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const VALID_COMMUNITY_TYPES = new Set<string>(['condo_718', 'hoa_720', 'apartment']);

export default async function PmCommunitiesPage({ searchParams }: CommunitiesPageProps) {
  const [userId, resolvedSearchParams] = await Promise.all([
    requireAuthenticatedUserId(),
    searchParams,
  ]);

  const isPm = await isPmAdminInAnyCommunity(userId);
  if (!isPm) {
    redirect('/dashboard');
  }

  const rawType = typeof resolvedSearchParams.communityType === 'string'
    ? resolvedSearchParams.communityType
    : undefined;
  const rawSearch = typeof resolvedSearchParams.search === 'string'
    ? resolvedSearchParams.search
    : undefined;
  const rawReason = typeof resolvedSearchParams.reason === 'string'
    ? resolvedSearchParams.reason
    : undefined;

  const filters: PmCommunityFilters = {};
  if (rawType && VALID_COMMUNITY_TYPES.has(rawType)) {
    filters.communityType = rawType as CommunityType;
  }
  if (rawSearch && rawSearch.trim().length > 0) {
    filters.search = rawSearch.trim().slice(0, 100);
  }

  const communities = await listManagedCommunitiesForPm(userId, filters);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">My Communities</h1>
          <p className="mt-1 text-sm text-gray-500">
            {communities.length === 0
              ? 'No communities found'
              : `${communities.length} ${communities.length === 1 ? 'community' : 'communities'}`}
          </p>
        </div>
        <CommunityFilters />
      </div>

      {rawReason === 'invalid-selection' && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          The selected community could not be found or you no longer have access to it.
        </div>
      )}

      {communities.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-8 py-16 text-center">
          <p className="text-sm font-medium text-gray-600">No communities match your filters.</p>
          <p className="mt-1 text-sm text-gray-400">
            Try adjusting the type or search filters above.
          </p>
        </div>
      ) : (
        <ul
          role="list"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {communities.map((community) => (
            <li key={community.communityId}>
              <CommunityCard community={community} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
