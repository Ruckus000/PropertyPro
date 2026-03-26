export const dynamic = 'force-dynamic';

/**
 * Mobile Management Contact page.
 * Server component: auth + community contact fetch, then hands off to client content.
 */
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { requirePageAuthenticatedUser as requireAuthenticatedUser } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { createScopedClient, communities } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { MobileContactContent } from '@/components/mobile/MobileContactContent';

export default async function MobileHelpContactPage() {
  const requestHeaders = await headers();
  const communityId = Number(requestHeaders.get('x-community-id'));

  if (!Number.isInteger(communityId) || communityId <= 0) {
    redirect('/auth/login');
  }

  let userId: string;

  try {
    const user = await requireAuthenticatedUser();
    userId = user.id;
  } catch {
    redirect('/auth/login');
  }

  let isAdmin = false;

  try {
    const membership = await requireCommunityMembership(communityId, userId!);
    isAdmin = membership.isAdmin;
  } catch {
    redirect('/auth/login');
  }

  // Fetch community contact info
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom(communities, {}, eq(communities.id, communityId));
  const community = (rows as unknown as Record<string, unknown>[])[0];

  const contact = {
    name: (community?.['contactName'] as string | null) ?? null,
    email: (community?.['contactEmail'] as string | null) ?? null,
    phone: (community?.['contactPhone'] as string | null) ?? null,
  };

  return (
    <MobileContactContent
      contact={contact}
      isAdmin={isAdmin}
      communityId={communityId}
    />
  );
}
