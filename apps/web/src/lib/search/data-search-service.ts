import {
  searchDocumentsByTrigram,
  searchMaintenanceByTrigram,
  searchMeetingsByTrigram,
  searchResidentsByTrigram,
  searchViolationsByTrigram,
} from '@propertypro/db';
import { getFeaturesForCommunity } from '@propertypro/shared';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { formatAnnouncementAudienceLabel, searchVisibleAnnouncements } from '@/lib/announcements/read-visibility';
import { getMembershipResourceAccess } from '@/lib/db/access-control';
import { escapeLikePattern } from '@/lib/utils/escape-like';
import { SEARCH_GROUPS, type SearchGroupConfig } from './group-config';
import type { SearchGroupResponse, SearchResultItem } from './data-search-types';

const GENERIC_SEARCH_ERROR = 'Search is temporarily unavailable for this section.';

function isGroupEnabled(
  group: SearchGroupConfig,
  isAdmin: boolean,
  features: ReturnType<typeof getFeaturesForCommunity>,
  access: ReturnType<typeof getMembershipResourceAccess>,
): boolean {
  if (group.adminOnly && !isAdmin) {
    return false;
  }

  if (group.featureFlag && !features[group.featureFlag]) {
    return false;
  }

  return access[group.resource].read;
}

function emptyGroup(group: SearchGroupConfig): SearchGroupResponse {
  return {
    key: group.key,
    label: group.label,
    status: 'ok',
    totalCount: 0,
    results: [],
    durationMs: 0,
  };
}

async function executeSearchGroup(
  group: SearchGroupConfig,
  communityId: number,
  membership: CommunityMembership,
  query: string,
  limit: number,
): Promise<SearchGroupResponse> {
  const startedAt = Date.now();

  try {
    let results: SearchResultItem[] = [];
    let totalCount = 0;

    switch (group.key) {
      case 'documents': {
        const response = await searchDocumentsByTrigram(communityId, query, limit);
        totalCount = response.totalCount;
        results = response.results.map((row) => ({
          id: row.id,
          title: row.title,
          subtitle: row.category_name ?? row.mime_type,
          href: `/documents/${row.id}`,
          entityType: 'document',
          category: row.category_name,
          fileType: row.mime_type,
          relevance: row.relevance,
        }));
        break;
      }
      case 'announcements': {
        const response = await searchVisibleAnnouncements(communityId, membership, query, limit);
        totalCount = response.totalCount;
        results = response.rows.map((row) => ({
          id: row.id,
          title: row.title,
          subtitle: formatAnnouncementAudienceLabel(row.audience),
          href: `/announcements/${row.id}?communityId=${communityId}`,
          entityType: 'announcement',
          audience: row.audience,
          publishedAt: row.publishedAt,
          relevance: row.relevance,
        }));
        break;
      }
      case 'meetings': {
        const response = await searchMeetingsByTrigram(communityId, query, limit);
        totalCount = response.totalCount;
        results = response.results.map((row) => ({
          id: row.id,
          title: row.title,
          subtitle: row.meeting_type,
          href: `/meetings/${row.id}`,
          entityType: 'meeting',
          meetingType: row.meeting_type,
          startsAt: row.starts_at,
          relevance: row.relevance,
        }));
        break;
      }
      case 'maintenance': {
        const response = await searchMaintenanceByTrigram(communityId, query, limit, {
          isAdmin: membership.isAdmin,
          userId: membership.userId,
        });
        totalCount = response.totalCount;
        results = response.results.map((row) => ({
          id: row.id,
          title: row.title,
          subtitle: `${row.priority} · ${row.status}`,
          href: `/maintenance/${row.id}`,
          entityType: 'maintenance',
          status: row.status,
          priority: row.priority,
          relevance: row.relevance,
        }));
        break;
      }
      case 'violations': {
        const response = await searchViolationsByTrigram(communityId, query, limit, {
          isAdmin: membership.isAdmin,
          userId: membership.userId,
        });
        totalCount = response.totalCount;
        results = response.results.map((row) => ({
          id: row.id,
          title: row.description.slice(0, 100),
          subtitle: `${row.severity} · ${row.status}`,
          href: `/violations/${row.id}`,
          entityType: 'violation',
          status: row.status,
          severity: row.severity,
          relevance: row.relevance,
        }));
        break;
      }
      case 'residents': {
        const sanitizedInput = escapeLikePattern(query);
        const response = await searchResidentsByTrigram(
          communityId,
          query,
          sanitizedInput,
          limit,
        );
        totalCount = response.totalCount;
        results = response.results.map((row) => ({
          id: row.id,
          title: row.full_name ?? row.email,
          subtitle: row.unit_number ? `Unit ${row.unit_number}` : row.role,
          href: `/residents/${row.id}`,
          entityType: 'resident',
          role: row.role,
          unitNumber: row.unit_number,
          relevance: row.relevance,
        }));
        break;
      }
      default: {
        const exhaustiveCheck: never = group.key;
        throw new Error(`Unsupported search group: ${String(exhaustiveCheck)}`);
      }
    }

    return {
      key: group.key,
      label: group.label,
      status: 'ok',
      totalCount,
      results,
      durationMs: Date.now() - startedAt,
    };
  } catch {
    return {
      key: group.key,
      label: group.label,
      status: 'error',
      totalCount: 0,
      results: [],
      error: GENERIC_SEARCH_ERROR,
      durationMs: Date.now() - startedAt,
    };
  }
}

export function getAccessibleSearchGroups(membership: CommunityMembership): readonly SearchGroupConfig[] {
  const features = getFeaturesForCommunity(membership.communityType);
  const access = getMembershipResourceAccess(membership);
  return SEARCH_GROUPS.filter((group) =>
    isGroupEnabled(group, membership.isAdmin, features, access),
  );
}

export async function searchAccessibleGroups(
  communityId: number,
  membership: CommunityMembership,
  query: string,
  limit: number,
): Promise<SearchGroupResponse[]> {
  const groups = getAccessibleSearchGroups(membership);
  const trimmedQuery = query.trim();
  const isNumeric = /^\d+$/.test(trimmedQuery);
  const minLength = isNumeric ? 1 : 2;

  if (trimmedQuery.length < minLength) {
    return groups.map(emptyGroup);
  }

  return Promise.all(
    groups.map((group) => executeSearchGroup(group, communityId, membership, trimmedQuery, limit)),
  );
}
