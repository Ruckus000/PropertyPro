import {
  announcements,
  clampPageSize,
  communities,
  createScopedClient,
  demoSeedRegistry,
  type Announcement,
  type Community,
  type PaginatedResult,
} from '@propertypro/db';
import { and, desc, eq, inArray, isNull, lt, notInArray, or, sql, type SQL } from '@propertypro/db/filters';
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
  includeDeleted?: boolean;
  query?: string;
  limit?: number;
  cursor?: string | null;
  pageSize?: number | null;
}

export interface VisibleAnnouncementsResult<T> {
  rows: T[];
  totalCount: number;
  pagination?: PaginatedResult<T>['pagination'];
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
    const publishedDiff = new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    if (publishedDiff !== 0) return publishedDiff;
    const leftId = 'id' in a && typeof a.id === 'number' ? a.id : 0;
    const rightId = 'id' in b && typeof b.id === 'number' ? b.id : 0;
    return rightId - leftId;
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

interface AnnouncementOrderedCursorPayload {
  isPinned: boolean;
  publishedAt: string;
  id: number;
}

interface DemoAnnouncementProvenanceWhere {
  where?: SQL;
  failClosed: boolean;
}

function encodeAnnouncementOrderedCursor(payload: AnnouncementOrderedCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeAnnouncementOrderedCursor(
  cursor: string | null | undefined,
): AnnouncementOrderedCursorPayload | null {
  if (!cursor) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { isPinned?: unknown }).isPinned === 'boolean' &&
      typeof (parsed as { publishedAt?: unknown }).publishedAt === 'string' &&
      Number.isInteger((parsed as { id?: unknown }).id)
    ) {
      const publishedAt = new Date((parsed as { publishedAt: string }).publishedAt);
      if (Number.isNaN(publishedAt.getTime())) {
        return null;
      }
      return {
        isPinned: (parsed as { isPinned: boolean }).isPinned,
        publishedAt: publishedAt.toISOString(),
        id: (parsed as { id: number }).id,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function buildAnnouncementQueryWhere(query: string | null | undefined): SQL | undefined {
  const normalizedQuery = query?.trim();
  if (!normalizedQuery) return undefined;

  const pattern = `%${escapeLikePattern(normalizedQuery)}%`;
  return or(
    sql`${announcements.title} ILIKE ${pattern} ESCAPE '\\'`,
    sql`${announcements.body} ILIKE ${pattern} ESCAPE '\\'`,
  );
}

function buildAnnouncementAudienceWhere(membership: CommunityMembership): SQL | undefined {
  if (membership.isAdmin) {
    return undefined;
  }

  if (membership.role !== 'resident') {
    return eq(announcements.audience, 'all');
  }

  return inArray(
    announcements.audience,
    membership.isUnitOwner ? ['all', 'owners_only'] : ['all', 'tenants_only'],
  );
}

function buildAnnouncementOrderedCursorWhere(
  cursor: AnnouncementOrderedCursorPayload | null,
): SQL | undefined {
  if (!cursor) return undefined;

  const publishedAt = new Date(cursor.publishedAt);
  return or(
    lt(announcements.isPinned, cursor.isPinned),
    and(
      eq(announcements.isPinned, cursor.isPinned),
      or(
        lt(announcements.publishedAt, publishedAt),
        and(
          eq(announcements.publishedAt, publishedAt),
          lt(announcements.id, cursor.id),
        ),
      ),
    ),
  );
}

async function buildDemoAnnouncementProvenanceWhere(
  community: AnnouncementCommunityContext,
): Promise<DemoAnnouncementProvenanceWhere> {
  if (!community.isDemo && !community.trialEndsAt && !community.demoExpiresAt) {
    return { failClosed: false };
  }

  try {
    const scoped = createScopedClient(community.id);
    const rows = await scoped.selectFrom<{ entityId: string }>(
      demoSeedRegistry,
      { entityId: demoSeedRegistry.entityId },
      and(
        eq(demoSeedRegistry.communityId, community.id),
        eq(demoSeedRegistry.entityType, 'announcement'),
      ),
    );

    const ids = rows
      .map((row) => Number(row.entityId))
      .filter((value) => Number.isInteger(value) && value > 0);
    if (ids.length === 0) {
      return { failClosed: true };
    }
    return { where: notInArray(announcements.id, ids), failClosed: false };
  } catch {
    return { failClosed: true };
  }
}

async function buildVisibleAnnouncementsWhere(
  community: AnnouncementCommunityContext,
  membership: CommunityMembership,
  options: VisibleAnnouncementsOptions,
): Promise<{ where?: SQL; failClosed: boolean }> {
  const clauses: SQL[] = [];

  if (options.includeArchived !== true) {
    clauses.push(isNull(announcements.archivedAt));
  }

  const audienceWhere = buildAnnouncementAudienceWhere(membership);
  if (audienceWhere) {
    clauses.push(audienceWhere);
  }

  const queryWhere = buildAnnouncementQueryWhere(options.query);
  if (queryWhere) {
    clauses.push(queryWhere);
  }

  const demoWhere = await buildDemoAnnouncementProvenanceWhere(community);
  if (demoWhere.failClosed) {
    return { failClosed: true };
  }
  if (demoWhere.where) {
    clauses.push(demoWhere.where);
  }

  const cursorWhere = buildAnnouncementOrderedCursorWhere(
    decodeAnnouncementOrderedCursor(options.cursor),
  );
  if (cursorWhere) {
    clauses.push(cursorWhere);
  }

  return {
    where:
      clauses.length === 0
        ? undefined
        : clauses.length === 1
          ? clauses[0]
          : and(...clauses),
    failClosed: false,
  };
}

async function listVisibleAnnouncementsPage(
  community: AnnouncementCommunityContext,
  membership: CommunityMembership,
  options: VisibleAnnouncementsOptions = {},
): Promise<VisibleAnnouncementsResult<Announcement>> {
  const pageSize = clampPageSize(options.pageSize);
  const { where, failClosed } = await buildVisibleAnnouncementsWhere(community, membership, options);
  if (failClosed) {
    return {
      rows: [],
      totalCount: 0,
      pagination: { nextCursor: null, hasMore: false, pageSize },
    };
  }

  const scoped = createScopedClient(community.id);
  const rows = await scoped
    .selectFrom(announcements, {}, where)
    .orderBy(desc(announcements.isPinned), desc(announcements.publishedAt), desc(announcements.id))
    .limit(pageSize + 1);

  const hasMore = rows.length > pageSize;
  const dataRows = (hasMore ? rows.slice(0, pageSize) : rows) as Announcement[];
  const lastRow = dataRows[dataRows.length - 1];
  const nextCursor =
    hasMore && lastRow
      ? encodeAnnouncementOrderedCursor({
          isPinned: lastRow.isPinned,
          publishedAt: lastRow.publishedAt.toISOString(),
          id: lastRow.id,
        })
      : null;

  return {
    rows: dataRows,
    totalCount: dataRows.length,
    pagination: {
      nextCursor,
      hasMore: nextCursor !== null,
      pageSize,
    },
  };
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
    },
  );
  if (!canReadAnnouncements) {
    return { rows: [], totalCount: 0 };
  }

  const includeArchived = options.includeArchived === true;
  const includeDeleted = options.includeDeleted === true && membership.isAdmin;
  const normalizedQuery = normalizeQuery(options.query);

  const demoFiltered = await applyDemoAnnouncementProvenancePolicy(community, rows);
  const visible = demoFiltered.filter((announcement) => {
    if (!includeDeleted && announcement.deletedAt != null) {
      return false;
    }

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
  const includeDeletedAtQuery = options.includeDeleted === true && membership.isAdmin;
  const wantsPaginatedSqlPath =
    Object.prototype.hasOwnProperty.call(options, 'cursor') ||
    Object.prototype.hasOwnProperty.call(options, 'pageSize');

  const communityRows = await scoped.selectFrom(
    communities,
    {
      id: communities.id,
      isDemo: communities.isDemo,
      trialEndsAt: communities.trialEndsAt,
      demoExpiresAt: communities.demoExpiresAt,
    },
    eq(communities.id, communityId),
  );

  const community = communityRows[0];
  if (!community) {
    return { rows: [], totalCount: 0 };
  }

  const communityContext = {
    id: Number(community['id']),
    isDemo: Boolean(community['isDemo']),
    trialEndsAt: (community['trialEndsAt'] as Date | null | undefined) ?? null,
    demoExpiresAt: (community['demoExpiresAt'] as Date | null | undefined) ?? null,
  };

  if (wantsPaginatedSqlPath && !includeDeletedAtQuery) {
    const canReadAnnouncements = checkPermissionV2(
      membership.role,
      membership.communityType,
      'announcements',
      'read',
      {
        isUnitOwner: membership.isUnitOwner,
      },
    );
    if (!canReadAnnouncements) {
      return {
        rows: [],
        totalCount: 0,
        pagination: {
          nextCursor: null,
          hasMore: false,
          pageSize: clampPageSize(options.pageSize),
        },
      };
    }
    return listVisibleAnnouncementsPage(communityContext, membership, options);
  }

  const announcementRows = includeDeletedAtQuery
    ? await scoped.queryIncludingDeleted(announcements)
    : await scoped.query(announcements);

  return filterVisibleAnnouncements(
    communityContext,
    membership,
    announcementRows as Announcement[],
    options,
  );
}

export async function getVisibleAnnouncementById(
  communityId: number,
  membership: CommunityMembership,
  announcementId: number,
  options: { includeArchived?: boolean; includeDeleted?: boolean } = {},
): Promise<Announcement | null> {
  const { rows } = await listVisibleAnnouncements(communityId, membership, {
    includeArchived: options.includeArchived,
    includeDeleted: options.includeDeleted,
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
