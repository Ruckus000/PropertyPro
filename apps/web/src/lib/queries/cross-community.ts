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
import { findUserCommunitiesUnscoped } from '@propertypro/db/unsafe';
import { createScopedClient } from '@propertypro/db';
import {
  communities,
  complianceChecklistItems,
  documents,
  announcements,
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
 * Returns the ids of all non-deleted communities the user belongs to.
 */
export async function getAuthorizedCommunityIds(userId: string): Promise<number[]> {
  const rows = await findUserCommunitiesUnscoped(userId);
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

export async function getCommunityCards(userId: string): Promise<CommunityCard[]> {
  const communityIds = await getAuthorizedCommunityIds(userId);
  if (communityIds.length === 0) return [];
  const now = new Date();
  const results = await Promise.all(
    communityIds.map(async (cId): Promise<CommunityCard | null> => {
      const scoped = createScopedClient(cId);
      const meta = await fetchCommunityMeta(scoped, cId);
      if (!meta) return null;
      if (meta.communityType === 'apartment') {
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

export async function getActivityFeed(userId: string, days = 30): Promise<ActivityItem[]> {
  const communityIds = await getAuthorizedCommunityIds(userId);
  if (communityIds.length === 0) return [];
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const results = await Promise.all(
    communityIds.map(async (cId): Promise<ActivityItem[]> => {
      const scoped = createScopedClient(cId);
      const meta = await fetchCommunityMeta(scoped, cId);
      if (!meta) return [];
      type TimedRow = { id: number; title: string; createdAt: Date };
      const [docs, anns] = (await Promise.all([
        scoped
          .selectFrom<Row>(
            documents,
            { id: documents.id, title: documents.title, createdAt: documents.createdAt },
            gte(documents.createdAt, cutoff),
          )
          .orderBy(desc(documents.createdAt))
          .limit(10)
          .then((rows) => rows),
        scoped
          .selectFrom<Row>(
            announcements,
            { id: announcements.id, title: announcements.title, createdAt: announcements.createdAt },
            gte(announcements.createdAt, cutoff),
          )
          .orderBy(desc(announcements.createdAt))
          .limit(10)
          .then((rows) => rows),
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
          link: `/documents/${d.id}`,
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

export async function getUpcomingEvents(userId: string, days = 30): Promise<UpcomingEvent[]> {
  const communityIds = await getAuthorizedCommunityIds(userId);
  if (communityIds.length === 0) return [];
  const now = new Date();
  const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const results = await Promise.all(
    communityIds.map(async (cId): Promise<UpcomingEvent[]> => {
      const scoped = createScopedClient(cId);
      const meta = await fetchCommunityMeta(scoped, cId);
      if (!meta) return [];
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
