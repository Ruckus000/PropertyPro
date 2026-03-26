interface EntityListPathOptions {
  communityId: number | null;
  isAdmin: boolean;
  query?: string;
}

function withQuery(pathname: string, query?: string): string {
  const trimmed = query?.trim();
  if (!trimmed) return pathname;

  const params = new URLSearchParams({ q: trimmed });
  return `${pathname}?${params.toString()}`;
}

function withCommunityQuery(pathname: string, communityId: number, query?: string): string {
  const params = new URLSearchParams({ communityId: String(communityId) });
  const trimmed = query?.trim();
  if (trimmed) {
    params.set('q', trimmed);
  }

  return `${pathname}?${params.toString()}`;
}

export function getEntityListPath(
  groupKey: string,
  { communityId, isAdmin, query }: EntityListPathOptions,
): string | null {
  switch (groupKey) {
    case 'documents':
      return communityId
        ? withQuery(`/communities/${communityId}/documents`, query)
        : withQuery('/documents', query);
    case 'announcements':
      return communityId
        ? withCommunityQuery('/announcements', communityId, query)
        : withQuery('/announcements', query);
    case 'meetings':
      return communityId
        ? withQuery(`/communities/${communityId}/meetings`, query)
        : withQuery('/meetings', query);
    case 'maintenance':
      if (!communityId) return null;
      return isAdmin
        ? withCommunityQuery('/maintenance/inbox', communityId, query)
        : withCommunityQuery('/maintenance/submit', communityId, query);
    case 'violations':
      if (!communityId) return null;
      return isAdmin
        ? withCommunityQuery('/violations/inbox', communityId, query)
        : withCommunityQuery('/violations', communityId, query);
    case 'residents':
      if (!communityId) return null;
      return withCommunityQuery('/dashboard/residents', communityId, query);
    default:
      return null;
  }
}
