import {
  announcements,
  communities,
  createScopedClient,
  type Announcement,
  type Community,
} from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { checkPermissionV2 } from '@/lib/db/access-control';
import { applyDemoAnnouncementProvenancePolicy } from './demo-announcement-provenance';

export type AnnouncementAudience = 'all' | 'owners_only' | 'board_only' | 'tenants_only';

type AnnouncementCommunityContext = Pick<
  Community,
  'id' | 'isDemo' | 'trialEndsAt' | 'demoExpiresAt'
>;

export interface VisibleAnnouncementsOptions {
  includeArchived?: boolean;
  query?: string;
  limit?: number;
}

export interface VisibleAnnouncementsResult<T> {
  rows: T[];
  totalCount: number;
}

export interface VisibleAnnouncementSearchHit {
  id: number;
  title: string;
  audience: AnnouncementAudience;
  publishedAt: string;
  relevance: number;
}

const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  all: 'Everyone',
  owners_only: 'Owners only',
  board_only: 'Board only',
  tenants_only: 'Tenants only',
};

function normalizeQuery(query: string | null | undefined): string {
  return query?.trim().toLowerCase() ?? '';
}

function toAnnouncementAudience(value: unknown): AnnouncementAudience {
  if (value === 'owners_only' || value === 'board_only' || value === 'tenants_only') {
    return value;
  }
  return 'all';
}

function announcementTextMatches(announcement: Announcement, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;

  const title = announcement.title.toLowerCase();
  const body = announcement.body.toLowerCase();
  return title.includes(normalizedQuery) || body.includes(normalizedQuery);
}

function announcementRelevance(announcement: Announcement, normalizedQuery: string): number {
  const title = announcement.title.toLowerCase();
  const body = announcement.body.toLowerCase();

  if (title === normalizedQuery) return 1;
  if (title.startsWith(normalizedQuery)) return 0.95;
  if (title.includes(normalizedQuery)) return 0.85;
  if (body.includes(normalizedQuery)) return 0.65;

  return 0;
}

function sortAnnouncements<T extends { isPinned: boolean; publishedAt: Date | string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}

function communityContextFromMembership(
  membership: CommunityMembership,
): AnnouncementCommunityContext {
  return {
    id: membership.communityId,
    isDemo: membership.isDemo,
    trialEndsAt: membership.trialEndsAt,
    demoExpiresAt: membership.demoExpiresAt,
  };
}

export function canReadAnnouncementAudience(
  membership: Pick<CommunityMembership, 'role' | 'isUnitOwner' | 'isAdmin'>,
  audience: AnnouncementAudience,
): boolean {
  if (membership.isAdmin) {
    return true;
  }

  if (audience === 'all') {
    return true;
  }

  if (membership.role !== 'resident') {
    return false;
  }

  if (audience === 'owners_only') {
    return membership.isUnitOwner;
  }

  if (audience === 'tenants_only') {
    return !membership.isUnitOwner;
  }

  return false;
}

export function formatAnnouncementAudienceLabel(audience: AnnouncementAudience): string {
  return AUDIENCE_LABELS[audience];
}

export async function filterVisibleAnnouncements(
  community: AnnouncementCommunityContext,
  membership: CommunityMembership,
  rows: Announcement[],
  options: VisibleAnnouncementsOptions = {},
): Promise<VisibleAnnouncementsResult<Announcement>> {
  const canReadAnnouncements = checkPermissionV2(
    membership.role,
    membership.communityType,
    'announcements',
    'read',
    {
      isUnitOwner: membership.isUnitOwner,
      permissions: membership.permissions,
    },
  );
  if (!canReadAnnouncements) {
    return { rows: [], totalCount: 0 };
  }

  const includeArchived = options.includeArchived === true;
  const normalizedQuery = normalizeQuery(options.query);

  const demoFiltered = await applyDemoAnnouncementProvenancePolicy(community, rows);
  const visible = demoFiltered.filter((announcement) => {
    if (!includeArchived && announcement.archivedAt != null) {
      return false;
    }

    if (!canReadAnnouncementAudience(membership, toAnnouncementAudience(announcement.audience))) {
      return false;
    }

    return announcementTextMatches(announcement, normalizedQuery);
  });

  const sorted = sortAnnouncements(visible);
  const limited = options.limit ? sorted.slice(0, options.limit) : sorted;

  return {
    rows: limited,
    totalCount: visible.length,
  };
}

export async function listVisibleAnnouncements(
  communityId: number,
  membership: CommunityMembership,
  options: VisibleAnnouncementsOptions = {},
): Promise<VisibleAnnouncementsResult<Announcement>> {
  const scoped = createScopedClient(communityId);
  const [announcementRows, communityRows] = await Promise.all([
    scoped.query(announcements),
    scoped.selectFrom(
      communities,
      {
        id: communities.id,
        isDemo: communities.isDemo,
        trialEndsAt: communities.trialEndsAt,
        demoExpiresAt: communities.demoExpiresAt,
      },
      eq(communities.id, communityId),
    ),
  ]);

  const community = communityRows[0];
  if (!community) {
    return { rows: [], totalCount: 0 };
  }

  return filterVisibleAnnouncements(
    {
      id: Number(community['id']),
      isDemo: Boolean(community['isDemo']),
      trialEndsAt: (community['trialEndsAt'] as Date | null | undefined) ?? null,
      demoExpiresAt: (community['demoExpiresAt'] as Date | null | undefined) ?? null,
    },
    membership,
    announcementRows as Announcement[],
    options,
  );
}

export async function getVisibleAnnouncementById(
  communityId: number,
  membership: CommunityMembership,
  announcementId: number,
  options: { includeArchived?: boolean } = {},
): Promise<Announcement | null> {
  const { rows } = await listVisibleAnnouncements(communityId, membership, {
    includeArchived: options.includeArchived,
  });

  return rows.find((row) => row.id === announcementId) ?? null;
}

export async function searchVisibleAnnouncements(
  communityId: number,
  membership: CommunityMembership,
  query: string,
  limit: number,
): Promise<VisibleAnnouncementsResult<VisibleAnnouncementSearchHit>> {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) {
    return { rows: [], totalCount: 0 };
  }

  const { rows } = await listVisibleAnnouncements(communityId, membership, {
    includeArchived: false,
  });

  const matches = rows
    .map((announcement) => ({
      id: announcement.id,
      title: announcement.title,
      audience: toAnnouncementAudience(announcement.audience),
      publishedAt: announcement.publishedAt.toISOString(),
      relevance: announcementRelevance(announcement, normalizedQuery),
      isPinned: announcement.isPinned,
    }))
    .filter((announcement) => announcement.relevance > 0)
    .sort((a, b) => {
      if (b.relevance !== a.relevance) {
        return b.relevance - a.relevance;
      }
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

  return {
    rows: matches.slice(0, limit).map(({ isPinned: _isPinned, ...hit }) => hit),
    totalCount: matches.length,
  };
}

export function getAnnouncementCommunityContext(
  membership: CommunityMembership,
): AnnouncementCommunityContext {
  return communityContextFromMembership(membership);
}
