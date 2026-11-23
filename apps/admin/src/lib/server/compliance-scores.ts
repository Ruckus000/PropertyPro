/**
 * Compliance scores for the admin console, by the same rule the association's
 * own Compliance page and the PM Communities page use
 * (`scoreCommunityCompliance` in `@propertypro/shared`).
 *
 * Admin used to count a row as met whenever any document was linked to it.
 * That read a draft or deleted file, a yearly record a year out of date, a
 * late posting, and a meeting with no notice as met, so an operator could see
 * 100% for a community whose own page said it was behind.
 *
 * Reads, for the communities passed in (apartments are skipped: no posting
 * rules, no score):
 * - their live checklist rows;
 * - their meetings from `MEETING_SCORING_WINDOW_MONTHS` ago onward;
 * - every document a row or meeting names, soft-deleted ones included (a
 *   deleted file must read as "not posted", which needs its row). A document
 *   counts only for the community it belongs to.
 *
 * AUTHZ: service-role reads across tenants. Callers are platform-admin pages
 * that already passed `requireAdminPageSession()`, and pass only community ids
 * from their own real-community reads.
 */
import type { createAdminClient } from '@propertypro/db/supabase/admin';
import {
  calculateRollingWindowStart,
  MEETING_SCORING_WINDOW_MONTHS,
  scoreCommunityCompliance,
  type ComplianceScoringMeeting,
  type DerivedCompliance,
  type LinkedDocumentState,
} from '@propertypro/shared';
import { COMMUNITY_SCAN_PAGE_SIZE, fetchAllRowsInPages } from '@/lib/api/list-limits';

type AdminDb = ReturnType<typeof createAdminClient>;

/** What the rule needs to know about a community itself. */
export interface ScoredCommunity {
  id: number;
  community_type: 'condo_718' | 'hoa_720' | 'apartment';
  unit_count: number | null;
}

/**
 * Checklist rows and meetings are a few dozen per community. The bound only
 * exists so a scan that cannot finish throws instead of scoring a partial set.
 */
const SCORING_ROW_BOUND = 200 * COMMUNITY_SCAN_PAGE_SIZE;
/** Ids per document lookup: keeps the `in.(…)` filter well inside URL limits. */
const DOCUMENT_ID_CHUNK = 200;

interface ChecklistDbRow {
  id: number;
  community_id: number;
  template_key: string;
  is_applicable: boolean;
  document_id: number | null;
  document_posted_at: string | null;
  deadline: string | null;
  rolling_window: unknown;
}

interface MeetingDbRow {
  id: number;
  community_id: number;
  title: string;
  meeting_type: string;
  starts_at: string;
  notice_posted_at: string | null;
  minutes_approved_at: string | null;
  minutes_document_id: number | null;
}

interface DocumentDbRow {
  id: number;
  community_id: number;
  deleted_at: string | null;
  posted_at: string | null;
  received_at: string | null;
}

function toDate(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

function groupBy<T extends { community_id: number }>(rows: readonly T[]): Map<number, T[]> {
  const grouped = new Map<number, T[]>();
  for (const row of rows) {
    const list = grouped.get(row.community_id) ?? [];
    list.push(row);
    grouped.set(row.community_id, list);
  }
  return grouped;
}

async function fetchLinkedDocuments(
  db: AdminDb,
  documentIds: readonly number[],
  communityIds: readonly number[],
): Promise<DocumentDbRow[]> {
  const chunks: number[][] = [];
  for (let i = 0; i < documentIds.length; i += DOCUMENT_ID_CHUNK) {
    chunks.push(documentIds.slice(i, i + DOCUMENT_ID_CHUNK));
  }
  const pages = await Promise.all(
    chunks.map(async (chunk) => {
      // No deleted_at filter on purpose: see the module comment.
      const { data, error } = await db
        .from('documents')
        .select('id, community_id, deleted_at, posted_at, received_at')
        .in('id', chunk)
        .in('community_id', [...communityIds]);
      if (error) throw new Error(`Failed to load linked documents: ${error.message}`);
      return (data ?? []) as DocumentDbRow[];
    }),
  );
  return pages.flat();
}

/**
 * Score each condo/HOA community. A community with no applicable row is
 * absent from the map, as is every apartment: "no score", never 100%.
 */
export async function loadComplianceScores(
  db: AdminDb,
  communities: readonly ScoredCommunity[],
  now: Date = new Date(),
): Promise<Map<number, DerivedCompliance>> {
  const scored = communities.filter((c) => c.community_type !== 'apartment');
  const scores = new Map<number, DerivedCompliance>();
  if (scored.length === 0) return scores;
  const ids = scored.map((c) => c.id);
  const meetingsSince = calculateRollingWindowStart(now, MEETING_SCORING_WINDOW_MONTHS).toISOString();

  const [checklistRows, meetingRows] = await Promise.all([
    fetchAllRowsInPages<ChecklistDbRow>(
      'compliance checklist rows',
      (from, to) =>
        db
          .from('compliance_checklist_items')
          .select(
            'id, community_id, template_key, is_applicable, document_id, document_posted_at, deadline, rolling_window',
          )
          .in('community_id', ids)
          .is('deleted_at', null)
          .order('id')
          .range(from, to),
      COMMUNITY_SCAN_PAGE_SIZE,
      SCORING_ROW_BOUND,
    ),
    fetchAllRowsInPages<MeetingDbRow>(
      'meetings for compliance scoring',
      (from, to) =>
        db
          .from('meetings')
          .select(
            'id, community_id, title, meeting_type, starts_at, notice_posted_at, minutes_approved_at, minutes_document_id',
          )
          .in('community_id', ids)
          .is('deleted_at', null)
          .gte('starts_at', meetingsSince)
          .order('id')
          .range(from, to),
      COMMUNITY_SCAN_PAGE_SIZE,
      SCORING_ROW_BOUND,
    ),
  ]);

  const documentIds = [
    ...new Set(
      [...checklistRows.map((r) => r.document_id), ...meetingRows.map((m) => m.minutes_document_id)].filter(
        (id): id is number => typeof id === 'number',
      ),
    ),
  ];
  const documentRows = await fetchLinkedDocuments(db, documentIds, ids);

  const checklistByCommunity = groupBy(checklistRows);
  const meetingsByCommunity = groupBy(meetingRows);
  const documentsByCommunity = groupBy(documentRows);

  for (const community of scored) {
    // Only this community's documents: a row naming another community's file
    // finds nothing, so it reads as not posted.
    const documentStates = new Map<number, LinkedDocumentState>();
    for (const doc of documentsByCommunity.get(community.id) ?? []) {
      documentStates.set(doc.id, {
        deletedAt: toDate(doc.deleted_at),
        isDraft: doc.posted_at === null,
        postedAt: toDate(doc.posted_at),
        receivedAt: toDate(doc.received_at),
      });
    }
    const meetings: ComplianceScoringMeeting[] = (meetingsByCommunity.get(community.id) ?? [])
      .map((m) => ({
        id: m.id,
        title: m.title,
        meetingType: m.meeting_type,
        startsAt: new Date(m.starts_at),
        noticePostedAt: toDate(m.notice_posted_at),
        minutesApprovedAt: toDate(m.minutes_approved_at),
        minutesDocumentId: m.minutes_document_id,
      }))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id - b.id);
    const checklist = (checklistByCommunity.get(community.id) ?? []).map((r) => ({
      id: r.id,
      templateKey: r.template_key,
      isApplicable: r.is_applicable,
      documentId: r.document_id,
      documentPostedAt: r.document_posted_at,
      deadline: r.deadline,
      rollingWindow: r.rolling_window,
    }));

    const result = scoreCommunityCompliance({
      communityType: community.community_type,
      unitCount: community.unit_count,
      checklistRows: checklist,
      documentStates,
      meetings,
      now,
    });
    if (result && result.score !== null) scores.set(community.id, result);
  }
  return scores;
}
