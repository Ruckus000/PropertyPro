import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { createScopedClient, meetings } from '@propertypro/db';
import { PublicNotices } from '@/components/public/public-notices';
import { resolvePublicCommunity } from '@/lib/tenant/community-resolution';

interface PublicNoticesPageProps {
  params: Promise<{ subdomain: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PublicNoticesPage({
  params,
  searchParams,
}: PublicNoticesPageProps) {
  const [{ subdomain }, resolvedSearchParams, requestHeaders] = await Promise.all([
    params,
    searchParams,
    headers(),
  ]);

  const community = await resolvePublicCommunity(
    resolvedSearchParams,
    subdomain,
    requestHeaders.get('host'),
  );
  if (!community) {
    notFound();
  }

  if (community.communityType === 'apartment') {
    notFound();
  }

  const scoped = createScopedClient(community.id);
  const rows = await scoped.query(meetings);
  const now = Date.now();
  const notices = rows
    .filter((row) => {
      const startsAt = row['startsAt'];
      if (!(startsAt instanceof Date)) return false;
      return startsAt.getTime() >= now;
    })
    .sort((a, b) => {
      const aTime = (a['startsAt'] as Date).getTime();
      const bTime = (b['startsAt'] as Date).getTime();
      return aTime - bTime;
    })
    .slice(0, 12)
    .map((row) => ({
      id: row['id'] as number,
      title: row['title'] as string,
      meetingType: row['meetingType'] as string,
      startsAt: (row['startsAt'] as Date).toISOString(),
      location: row['location'] as string,
    }));

  return <PublicNotices communityName={community.name} notices={notices} />;
}
