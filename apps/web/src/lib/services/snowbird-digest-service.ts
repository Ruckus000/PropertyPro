/**
 * Snowbird digest compiler.
 *
 * Compiles a per-community activity recap for absentee owners AT SEND TIME
 * from data already in the platform — deliberately NOT the event-granular
 * notification_digest_queue (see the schema docblock). Given a scoped client
 * and a trailing window, it returns typed sections; the cron turns those into
 * one email per subscriber.
 *
 * Pure over its inputs (scoped client + window + reference date) so it unit-
 * tests without a live DB or the cron. All reads go through the scoped client
 * (AGENTS #13), which already excludes soft-deleted rows and scopes by
 * community.
 */
import type { createScopedClient } from '@propertypro/db';
import { documents, documentCategories, elections, meetings, polls } from '@propertypro/db';
import { and, gte, lte, eq, isNotNull } from '@propertypro/db/filters';

type ScopedClient = ReturnType<typeof createScopedClient>;

/** One line in a digest section. `date` is a pre-formatted human string. */
export interface DigestItem {
  title: string;
  detail?: string;
  date?: string;
  actionUrl: string;
}

export interface SnowbirdDigestSections {
  boardDecisions: DigestItem[];
  newDocuments: DigestItem[];
  upcoming: DigestItem[];
  /** One factual compliance line, or null when the community has no compliance. */
  complianceNote: string | null;
}

/** How many documents to list before collapsing into an "and N more" line. */
export const DIGEST_DOCUMENT_CAP = 10;
/** Look-ahead window for the "upcoming" section. */
export const DIGEST_UPCOMING_DAYS = 30;

function formatDate(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

type Row = Record<string, unknown>;

async function rows(builder: unknown): Promise<Row[]> {
  return (await builder) as Row[];
}

/**
 * Compile the digest for one community over `[windowStart, windowEnd]`, with
 * `upcoming` looking `DIGEST_UPCOMING_DAYS` days past `windowEnd`.
 *
 * @param scoped        - client already scoped to the target community
 * @param communityId   - used only to build portal deep-links
 * @param windowStart   - inclusive lower bound for "what happened"
 * @param windowEnd     - inclusive upper bound (usually now); anchors "upcoming"
 * @param hasCompliance - whether to include the compliance note
 */
export async function compileSnowbirdDigest(
  scoped: ScopedClient,
  communityId: number,
  windowStart: Date,
  windowEnd: Date,
  hasCompliance: boolean,
  complianceSummaryText: string | null = null,
): Promise<SnowbirdDigestSections> {
  const link = (path: string) => `/communities/${communityId}${path}`;
  const upcomingEnd = addDays(windowEnd, DIGEST_UPCOMING_DAYS);

  // --- Board decisions: minutes approved + elections certified in-window ---
  const boardDecisions: DigestItem[] = [];

  const approvedMeetings = await rows(
    scoped.selectFrom(
      meetings,
      {},
      and(
        isNotNull(meetings.minutesApprovedAt),
        gte(meetings.minutesApprovedAt, windowStart),
        lte(meetings.minutesApprovedAt, windowEnd),
      ),
    ),
  );
  for (const m of approvedMeetings) {
    boardDecisions.push({
      title: `Minutes approved: ${String(m.title)}`,
      date: formatDate(m.minutesApprovedAt as Date),
      actionUrl: link('/meetings'),
    });
  }

  const certifiedElections = await rows(
    scoped.selectFrom(
      elections,
      {},
      and(
        isNotNull(elections.certifiedAt),
        gte(elections.certifiedAt, windowStart),
        lte(elections.certifiedAt, windowEnd),
      ),
    ),
  );
  for (const e of certifiedElections) {
    boardDecisions.push({
      title: `Election certified: ${String(e.title)}`,
      date: formatDate(e.certifiedAt as Date),
      actionUrl: link('/board/polls'),
    });
  }

  // --- New documents in-window, grouped by category, capped ---
  const recentDocs = await rows(
    scoped.selectFrom(
      documents,
      {},
      and(gte(documents.createdAt, windowStart), lte(documents.createdAt, windowEnd)),
    ),
  );
  const categoryRows = await rows(scoped.query(documentCategories));
  const categoryName = new Map<number, string>(
    categoryRows.map((c) => [Number(c.id), String(c.name)]),
  );

  const newDocuments: DigestItem[] = recentDocs.slice(0, DIGEST_DOCUMENT_CAP).map((d) => ({
    title: String(d.title),
    detail: d.categoryId != null ? categoryName.get(Number(d.categoryId)) : undefined,
    date: formatDate(d.createdAt as Date),
    actionUrl: link('/documents'),
  }));
  if (recentDocs.length > DIGEST_DOCUMENT_CAP) {
    // Never silently truncate — say how many more.
    newDocuments.push({
      title: `…and ${recentDocs.length - DIGEST_DOCUMENT_CAP} more new document(s)`,
      actionUrl: link('/documents'),
    });
  }

  // --- Upcoming (next DIGEST_UPCOMING_DAYS): meetings, votes, poll closes ---
  const upcoming: DigestItem[] = [];

  const upcomingMeetings = await rows(
    scoped.selectFrom(
      meetings,
      {},
      and(gte(meetings.startsAt, windowEnd), lte(meetings.startsAt, upcomingEnd)),
    ),
  );
  for (const m of upcomingMeetings) {
    upcoming.push({
      title: `Meeting: ${String(m.title)}`,
      date: formatDate(m.startsAt as Date),
      actionUrl: link('/meetings'),
    });
  }

  const closingElections = await rows(
    scoped.selectFrom(
      elections,
      {},
      and(
        eq(elections.status, 'open'),
        gte(elections.closesAt, windowEnd),
        lte(elections.closesAt, upcomingEnd),
      ),
    ),
  );
  for (const e of closingElections) {
    upcoming.push({
      title: `Voting closes: ${String(e.title)}`,
      date: formatDate(e.closesAt as Date),
      actionUrl: link('/board/polls'),
    });
  }

  const closingPolls = await rows(
    scoped.selectFrom(
      polls,
      {},
      and(
        eq(polls.isActive, true),
        isNotNull(polls.endsAt),
        gte(polls.endsAt, windowEnd),
        lte(polls.endsAt, upcomingEnd),
      ),
    ),
  );
  for (const p of closingPolls) {
    upcoming.push({
      title: `Poll closes: ${String(p.title)}`,
      date: formatDate(p.endsAt as Date),
      actionUrl: link('/board/polls'),
    });
  }

  return {
    boardDecisions,
    newDocuments,
    upcoming,
    complianceNote: hasCompliance ? complianceSummaryText : null,
  };
}

/** True when every section is empty — the cron skips the send (never mail "nothing happened"). */
export function isDigestEmpty(sections: SnowbirdDigestSections): boolean {
  return (
    sections.boardDecisions.length === 0 &&
    sections.newDocuments.length === 0 &&
    sections.upcoming.length === 0
  );
}
