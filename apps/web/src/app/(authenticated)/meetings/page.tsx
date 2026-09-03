import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { PageHeader } from '@/components/shared/page-header';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MeetingsRedirectPage({ searchParams }: PageProps) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([
    searchParams,
    headers(),
  ]);

  const context = resolveCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    host: requestHeaders.get('host'),
  });

  if (context.communityId) {
    redirect(`/communities/${context.communityId}/meetings`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Meetings" />
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        Add a valid <code className="rounded bg-[var(--surface-subtle)] px-1">communityId</code> query parameter to open the meetings calendar.
      </p>
    </div>
  );
}
