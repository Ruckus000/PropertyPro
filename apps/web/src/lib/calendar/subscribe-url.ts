import {
  getWebAppHostnameFromEnv,
  getWebAppOriginFromEnv,
  isReservedSubdomain,
} from '@propertypro/shared';

type CalendarFeedKind = 'community' | 'personal';

interface BuildCalendarSubscribeUrlOptions {
  communityId: number;
  communitySlug: string;
  feed: CalendarFeedKind;
  currentOrigin?: string | null;
  subscriptionToken?: string;
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
  );
}

function normalizeApexHostname(hostname: string, communitySlug: string): string {
  const parts = hostname
    .toLowerCase()
    .split('.')
    .filter(Boolean);

  if (parts.length >= 3) {
    const first = parts[0];
    if (first && (first === communitySlug.toLowerCase() || isReservedSubdomain(first))) {
      return parts.slice(1).join('.');
    }
  }

  return parts.join('.');
}

function parseOrigin(value: string | null | undefined): URL | null {
  if (!value) return null;

  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function buildFeedPath(feed: CalendarFeedKind): string {
  return feed === 'community'
    ? '/api/v1/calendar/meetings.ics'
    : '/api/v1/calendar/my-meetings.ics';
}

function appendLocalParams(
  url: URL,
  communityId: number,
  subscriptionToken?: string,
): string {
  url.searchParams.set('communityId', String(communityId));
  if (subscriptionToken) {
    url.searchParams.set('token', subscriptionToken);
  }
  return url.toString();
}

export function buildCalendarSubscribeUrl({
  communityId,
  communitySlug,
  currentOrigin,
  feed,
  subscriptionToken,
}: BuildCalendarSubscribeUrlOptions): string {
  const currentUrl = parseOrigin(currentOrigin);
  const feedPath = buildFeedPath(feed);

  if (currentUrl && isLocalHostname(currentUrl.hostname)) {
    return appendLocalParams(new URL(feedPath, currentUrl.origin), communityId, subscriptionToken);
  }

  if (!communitySlug) {
    const fallbackOrigin = currentUrl?.origin ?? getWebAppOriginFromEnv();
    return appendLocalParams(new URL(feedPath, fallbackOrigin), communityId, subscriptionToken);
  }

  const apexHostname = normalizeApexHostname(getWebAppHostnameFromEnv(), communitySlug);
  const tenantHostname = `${communitySlug}.${apexHostname}`;

  if (currentUrl?.hostname.toLowerCase() === tenantHostname) {
    const url = new URL(feedPath, currentUrl.origin);
    if (subscriptionToken) {
      url.searchParams.set('token', subscriptionToken);
    }
    return url.toString();
  }

  const protocol = currentUrl?.protocol ?? 'https:';
  const url = new URL(`${protocol}//${tenantHostname}${feedPath}`);
  if (subscriptionToken) {
    url.searchParams.set('token', subscriptionToken);
  }
  return url.toString();
}
