// breadcrumbs:exempt — redirect-only page
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { getOptionalPageCommunityId } from '@/lib/request/page-community-context';
import { TENANT_SOURCE_HEADER } from '@/lib/request/forwarded-headers';
import { resolveDocumentCommunity } from '@/lib/documents/resolve-document-community';
import { getPageSupportScope } from '@/lib/support/support-scope';
import { buildCommunityUrl } from '@/lib/utils/community-url';

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Tenant sources where the HOST names the community, so it wins over the path. */
const HOST_TENANT_SOURCES: ReadonlySet<string> = new Set(['host_subdomain', 'custom_domain']);

/**
 * `/documents/<id>` → `/communities/<cid>/documents?doc=<id>`, which opens the
 * document in the library's inspector.
 *
 * Emails, notifications, search and the PM activity feed all link here. The
 * request's community (from `?communityId=` or the host, as middleware
 * resolved it) is tried first, then the caller's other communities; a
 * document the caller may not open 404s exactly like a missing one.
 *
 * On a community's own host, middleware takes the community from the host and
 * ignores the path, so `/communities/<other>/…` there renders the host's shell
 * around the other community's library and its API calls 404. A document in
 * another community is therefore opened on THAT community's subdomain — the
 * same move the sidebar's community switcher makes.
 */
export default async function DocumentRedirectPage({ params }: PageProps) {
  const { id } = await params;

  const documentId = Number(id);
  if (!Number.isInteger(documentId) || documentId <= 0) {
    notFound();
  }

  const userId = await requireAuthenticatedUserId();
  const requestCommunityId = await getOptionalPageCommunityId();
  const match = await resolveDocumentCommunity({
    userId,
    documentId,
    preferredCommunityId: requestCommunityId,
    supportScope: await getPageSupportScope(),
  });

  if (match === null) {
    notFound();
  }

  const path = `/communities/${match.communityId}/documents?doc=${documentId}`;
  const tenantSource = (await headers()).get(TENANT_SOURCE_HEADER);
  if (
    tenantSource !== null &&
    HOST_TENANT_SOURCES.has(tenantSource) &&
    match.communityId !== requestCommunityId
  ) {
    redirect(buildCommunityUrl(match.slug, path));
  }

  redirect(path);
}
