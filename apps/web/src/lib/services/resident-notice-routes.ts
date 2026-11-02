/**
 * Where a resident notice links to. Pure (no db import) so the senders, the
 * notification service and their tests all use the real table.
 *
 * The email, the digest entry and the in-app notification read the same
 * path, so the three cannot point at different pages. Every page here is one
 * a resident can open: the compliance page is not (tenants lack
 * `compliance:read`, apartments have no compliance feature).
 */

export type ResidentNoticeTopic = 'package' | 'visitor' | 'violation' | 'arc';

export interface ResidentNoticeTopicConfig {
  /** Short label for the email, e.g. "Package delivery". */
  category: string;
  /** Verb-first button text. */
  actionLabel: string;
  path: (communityId: number, recordId: string) => string;
}

export const RESIDENT_NOTICE_TOPICS: Record<ResidentNoticeTopic, ResidentNoticeTopicConfig> = {
  package: {
    category: 'Package delivery',
    actionLabel: 'View my packages',
    path: (communityId) => `/dashboard/packages?communityId=${communityId}`,
  },
  visitor: {
    category: 'Visitor',
    actionLabel: 'View my visitors',
    path: (communityId) => `/dashboard/visitors?communityId=${communityId}`,
  },
  violation: {
    category: 'Violation notice',
    actionLabel: 'View violation',
    path: (communityId, recordId) =>
      `/violations/${encodeURIComponent(recordId)}?communityId=${communityId}`,
  },
  // There is no ARC detail page; the list is where a resident sees the decision.
  arc: {
    category: 'ARC request',
    actionLabel: 'View my ARC requests',
    path: (communityId) => `/arc-requests?communityId=${communityId}`,
  },
};

/** The app-relative page a resident notice links to. */
export function residentNoticePath(
  topic: ResidentNoticeTopic,
  communityId: number,
  recordId: string,
): string {
  return RESIDENT_NOTICE_TOPICS[topic].path(communityId, recordId);
}
