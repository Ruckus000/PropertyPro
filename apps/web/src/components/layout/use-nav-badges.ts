'use client';

/**
 * useNavBadges — the two count badges the shell navigation shows, shared by the
 * side rail and the top tab bar so neither carries a near-copy of the rules.
 *
 * Pending join requests: the GET needs residents.write and an entitled
 * community, so only an admin on a non-lapsed community asks — anyone else would
 * just collect a 403. Shares the Directory's cache entry, so an approve/deny
 * there updates the badge.
 *
 * Missing Florida records: the Website item's count (D11). Only a manager of a
 * condo or HOA whose plan has the site editor can have any (apartments owe
 * none, and the GET refuses everyone else), so no one else sends the request.
 * The nav is on every authenticated page, so the answer stays fresh for five
 * minutes instead of refetching on each navigation; publishing, a look switch
 * or a records change invalidates it sooner.
 *
 * A hidden badge is always 0, even when the query has cached data.
 */
import {
  isAdminRole,
  type CommunityFeatures,
  type CommunityRole,
  type CommunityType,
} from '@propertypro/shared';
import { useAdminJoinRequests } from '@/hooks/use-admin-join-requests';
import { useRecordsAlert } from '@/hooks/use-records-alert';

/** How long the missing-records count counts as fresh across navigations. */
const RECORDS_BADGE_STALE_MS = 5 * 60 * 1000;

export interface UseNavBadgesArgs {
  communityId: number | null;
  role: CommunityRole | null;
  communityType: CommunityType | null;
  features: CommunityFeatures | null;
  /** On a cross-community PM portfolio route, where neither badge applies. */
  isPmContext: boolean;
  /** An admin on a lapsed community: admin reads are locked, so nothing is asked. */
  lapsedAdmin: boolean;
}

export interface NavBadges {
  pendingJoinRequests: number;
  missingRecords: number;
}

export function useNavBadges({
  communityId,
  role,
  communityType,
  features,
  isPmContext,
  lapsedAdmin,
}: UseNavBadgesArgs): NavBadges {
  const showRequestBadge = !isPmContext && communityId !== null && role !== null && isAdminRole(role) && !lapsedAdmin;
  const requestsQ = useAdminJoinRequests({ communityId: communityId ?? undefined, enabled: showRequestBadge });
  const pendingJoinRequests = showRequestBadge ? (requestsQ.data?.length ?? 0) : 0;

  const showRecordsBadge =
    showRequestBadge &&
    (communityType === 'condo_718' || communityType === 'hoa_720') &&
    features?.hasSiteEditor === true;
  const recordsQ = useRecordsAlert(communityId ?? 0, {
    enabled: showRecordsBadge,
    staleTime: RECORDS_BADGE_STALE_MS,
  });
  const missingRecords = showRecordsBadge ? (recordsQ.data?.missingCount ?? 0) : 0;

  return { pendingJoinRequests, missingRecords };
}
