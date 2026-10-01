/**
 * Cross-community query helpers.
 *
 * Authorization boundary: these helpers query across all communities a user
 * belongs to. Callers MUST have authenticated the user via
 * `requireAuthenticatedUserId()` before invoking. The helpers only return data
 * scoped to the user's own membership rows.
 *
 * This module is ALLOWLISTED for unsafe DB access. Each function MUST first
 * resolve the caller's authorized community_id list via user_roles, then run
 * scoped queries only against those IDs. Never run a single SELECT with
 * `community_id IN (...)` that bypasses RLS — parallel scoped queries
 * preserve the RLS guarantee.
 */
// AUTHZ: Cross-community query helpers — unified owner dashboard + aggregated notifications. User is the authorization anchor; callers MUST resolve the user's authorized community ids via getAuthorizedCommunityIds() and then run scoped queries per community.
import { findUserCommunitiesUnscoped } from '@propertypro/db/unsafe';
import { buildAccessibleDocumentsFilter, createScopedClient } from '@propertypro/db';
import type { RbacResource } from '@propertypro/shared';
import { checkPermissionV2 } from '@/lib/db/access-control';
import { requireCommunityMembership, type CommunityMembership } from '@/lib/api/community-membership';
import { listVisibleAnnouncements } from '@/lib/announcements/read-visibility';
import { narrowToSupportScope, type SupportScope } from '@/lib/support/support-scope';
import {
  communities,
  complianceChecklistItems,
  documents,
  meetings,
} from '@propertypro/db';
import { and, asc, desc, eq, gte, lte } from '@propertypro/db/filters';
import type {
  CommunityCard,
  CommunityType,
  ActivityItem,
  UpcomingEvent,
} from './cross-community.types';

/**
 * Returns the ids of all non-deleted communities the user belongs to —
 * narrowed to the consented community under a support session.
 *
 * `supportScope` is REQUIRED (pass `getSupportScope(req.headers)` from a route,
 * `await getPageSupportScope()` from a page) so no caller can forget it: under
 * impersonation the "user" is the target, whose memberships span communities
 * the session was never granted. Every helper below funnels through here.
 */
export async function getAuthorizedCommunityIds(
  userId: string,
  supportScope: SupportScope | null,
): Promise<number[]> {
  const rows = narrowToSupportScope(
    await findUserCommunitiesUnscoped(userId),
    supportScope,
    (r) => r.communityId,
  );
  const ids = new Set<number>();
  for (const row of rows) {
    ids.add(row.communityId);
  }
  return [...ids];
}

interface ScopedCommunityMeta {
  name: string;
  slug: string;
  communityType: CommunityType;
}

type Row = Record<string, unknown>;

async function fetchCommunityMeta(
  scoped: ReturnType<typeof createScopedClient>,
  cId: number,
): Promise<ScopedCommunityMeta | null> {
  const rows = (await scoped
    .selectFrom<Row>(
      communities,
      {
        name: communities.name,
        slug: communities.slug,
        communityType: communities.communityType,
      },
      eq(communities.id, cId),
    )
    .limit(1)) as Array<{ name: string; slug: string; communityType: CommunityType }>;
  const row = rows[0];
  return row ? { name: row.name, slug: row.slug, communityType: row.communityType } : null;
}

/**
 * The caller's membership in `cId`, or null when they no longer hold one (a
 * role revoked between the id lookup and this read). Every section of the
 * overview is gated on it: the overview must show exactly what each feature's
 * own route would, not a superset (route-authz census F2, 2026-09-28 — it used
 * to list board-only announcements, role-restricted document titles and the
 * compliance score to any member).
 */
async function membershipOrNull(cId: number, userId: string): Promise<CommunityMembership | null> {
  try {
    return await requireCommunityMembership(cId, userId);
  } catch {
    return null;
  }
}

function can(membership: CommunityMembership, resource: RbacResource): boolean {
  return checkPermissionV2(membership.role, membership.communityType, resource, 'read', {
    isUnitOwner: membership.isUnitOwner,
  });
}

function classifyComplianceEscalation(
  deadline: Date | null,
  now: Date,
): 'calm' | 'aware' | 'urgent' | 'critical' {
  if (!deadline) return 'calm';
  const ms = deadline.getTime() - now.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days < 0) return 'critical';
  if (days <= 7) return 'urgent';
  if (days <= 30) return 'aware';
  return 'calm';
}

export async function getCommunityCards(
  userId: string,
  supportScope: SupportScope | null,
): Promise<CommunityCard[]> {
  const communityIds = await getAuthorizedCommunityIds(userId, supportScope);
  if (communityIds.length === 0) return [];
  const now = new Date();
  const results = await Promise.all(
    communityIds.map(async (cId): Promise<CommunityCard | null> => {
      const scoped = createScopedClient(cId);
      const meta = await fetchCommunityMeta(scoped, cId);
      if (!meta) return null;
      const membership = await membershipOrNull(cId, userId);
      if (!membership) return null;
      if (meta.communityType === 'apartment' || !can(membership, 'compliance')) {
        return {
          communityId: cId,
          communityName: meta.name,
          communitySlug: meta.slug,
          communityType: meta.communityType,
          complianceScore: null,
          urgentItemCount: 0,
          criticalItemCount: 0,
        };
      }
      const items = (await scoped.selectFrom<Row>(
        complianceChecklistItems,
        {
          documentId: complianceChecklistItems.documentId,
          isApplicable: complianceChecklistItems.isApplicable,
          deadline: complianceChecklistItems.deadline,
        },
      )) as Array<{ documentId: number | null; isApplicable: boolean; deadline: Date | null }>;
      const applicable = items.filter((i) => i.isApplicable);
      const satisfied = applicable.filter((i) => i.documentId != null).length;
      const score = applicable.length > 0 ? Math.round((satisfied / applicable.length) * 100) : null;
      let urgentCount = 0;
      let criticalCount = 0;
      for (const item of applicable) {
        if (item.documentId != null) continue;
        const tier = classifyComplianceEscalation(item.deadline, now);
        if (tier === 'urgent') urgentCount++;
        if (tier === 'critical') criticalCount++;
      }
      return {
        communityId: cId,
        communityName: meta.name,
        communitySlug: meta.slug,
        communityType: meta.communityType,
        complianceScore: score,
        urgentItemCount: urgentCount,
        criticalItemCount: criticalCount,
      };
    }),
  );
  return results.filter((r): r is CommunityCard => r !== null);
}

export async function getActivityFeed(
  userId: string,
  supportScope: SupportScope | null,
  days = 30,
): Promise<ActivityItem[]> {
  const communityIds = await getAuthorizedCommunityIds(userId, supportScope);
  if (communityIds.length === 0) return [];
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const results = await Promise.all(
    communityIds.map(async (cId): Promise<ActivityItem[]> => {
      const scoped = createScopedClient(cId);
      const meta = await fetchCommunityMeta(scoped, cId);
      if (!meta) return [];
      const membership = await membershipOrNull(cId, userId);
      if (!membership) return [];
      type TimedRow = { id: number; title: string; createdAt: Date };
      // Documents: the same role/category + source-type predicate the documents
      // routes use. Announcements: the same visibility function the
      // announcements feed uses (audience, archived, expired, demo provenance).
      const [docs, anns] = (await Promise.all([
        can(membership, 'documents')
          ? (async () => {
              const where = await buildAccessibleDocumentsFilter(
                {
                  communityId: cId,
                  role: membership.role,
                  communityType: membership.communityType,
                  isUnitOwner: membership.isUnitOwner,
                },
                gte(documents.createdAt, cutoff),
              );
              return scoped
                .selectFrom<Row>(
                  documents,
                  { id: documents.id, title: documents.title, createdAt: documents.createdAt },
                  where,
                )
                .orderBy(desc(documents.createdAt))
                .limit(10);
            })()
          : Promise.resolve([]),
        listVisibleAnnouncements(cId, membership).then(({ rows }) =>
          rows
            .filter((a) => a.createdAt >= cutoff)
            .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())
            .slice(0, 10)
            .map((a) => ({ id: a.id, title: a.title, createdAt: a.createdAt })),
        ),
      ])) as [TimedRow[], TimedRow[]];
      const items: ActivityItem[] = [];
      for (const d of docs) {
        items.push({
          id: `doc-${cId}-${d.id}`,
          communityId: cId,
          communityName: meta.name,
          communitySlug: meta.slug,
          type: 'document',
          title: d.title,
          occurredAt: d.createdAt.toISOString(),
          link: `/documents/${d.id}?communityId=${cId}`,
        });
      }
      for (const a of anns) {
        items.push({
          id: `ann-${cId}-${a.id}`,
          communityId: cId,
          communityName: meta.name,
          communitySlug: meta.slug,
          type: 'announcement',
          title: a.title,
          occurredAt: a.createdAt.toISOString(),
          link: `/announcements/${a.id}`,
        });
      }
      return items;
    }),
  );
  return results.flat().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 50);
}

export async function getUpcomingEvents(
  userId: string,
  supportScope: SupportScope | null,
  days = 30,
): Promise<UpcomingEvent[]> {
  const communityIds = await getAuthorizedCommunityIds(userId, supportScope);
  if (communityIds.length === 0) return [];
  const now = new Date();
  const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const results = await Promise.all(
    communityIds.map(async (cId): Promise<UpcomingEvent[]> => {
      const scoped = createScopedClient(cId);
      const meta = await fetchCommunityMeta(scoped, cId);
      if (!meta) return [];
      const membership = await membershipOrNull(cId, userId);
      if (!membership || !can(membership, 'meetings')) return [];
      const upcoming = (await scoped
        .selectFrom<Row>(
          meetings,
          { id: meetings.id, title: meetings.title, startsAt: meetings.startsAt },
          and(gte(meetings.startsAt, now), lte(meetings.startsAt, until)),
        )
        .orderBy(asc(meetings.startsAt))
        .limit(10)
        .then((rows) => rows)) as Array<{ id: number; title: string; startsAt: Date }>;
      return upcoming.map((m) => ({
        id: `meeting-${cId}-${m.id}`,
        communityId: cId,
        communityName: meta.name,
        communitySlug: meta.slug,
        type: 'meeting' as const,
        title: m.title,
        scheduledFor: m.startsAt.toISOString(),
        link: `/meetings/${m.id}`,
      }));
    }),
  );
  return results.flat().sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor)).slice(0, 20);
}
