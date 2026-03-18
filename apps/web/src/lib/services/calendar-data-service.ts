import {
  assessmentLineItems,
  assessments,
  createScopedClient,
  meetings,
  units,
} from '@propertypro/db';
import { and, asc, eq, gte, inArray, lt, lte } from '@propertypro/db/filters';
import { listActorUnitIds } from '@/lib/units/actor-units';
import type { AssessmentLineItemStatus } from '@/lib/services/finance-service';

export interface CalendarMeetingRecord {
  [key: string]: unknown;
  id: number;
  title: string;
  meetingType: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string;
}

export interface AggregateAssessmentDueRecord {
  assessmentId: number;
  dueDate: string;
  assessmentTitle: string;
  unitCount: number;
  pendingCount: number;
  totalAmountCents: number;
}

export interface OwnerAssessmentDueRecord {
  assessmentId: number;
  dueDate: string;
  assessmentTitle: string;
  amountCents: number;
  status: AssessmentLineItemStatus;
  unitLabel: string;
}

interface AssessmentLineItemRow {
  [key: string]: unknown;
  id: number;
  assessmentId: number | null;
  unitId: number;
  amountCents: number;
  dueDate: string;
  status: AssessmentLineItemStatus;
  lateFeeCents: number;
}

interface AssessmentRow {
  [key: string]: unknown;
  id: number;
  title: string;
}

interface UnitLabelRow {
  [key: string]: unknown;
  id: number;
  unitNumber: string;
  building: string | null;
}

function formatUnitLabel(row: UnitLabelRow): string {
  return row.building ? `${row.building} ${row.unitNumber}` : row.unitNumber;
}

export async function listCommunityCalendarMeetings(
  communityId: number,
  range?: { startUtc: Date; endUtcExclusive: Date },
): Promise<CalendarMeetingRecord[]> {
  const scoped = createScopedClient(communityId);
  const whereClause = range
    ? and(
        gte(meetings.startsAt, range.startUtc),
        lt(meetings.startsAt, range.endUtcExclusive),
      )
    : undefined;

  return scoped
    .selectFrom<CalendarMeetingRecord>(
      meetings,
      {
        id: meetings.id,
        title: meetings.title,
        meetingType: meetings.meetingType,
        startsAt: meetings.startsAt,
        endsAt: meetings.endsAt,
        location: meetings.location,
      },
      whereClause,
    )
    .orderBy(asc(meetings.startsAt), asc(meetings.id));
}

export async function listAggregateAssessmentDueRecords(
  communityId: number,
  range?: { start: string; end: string },
): Promise<AggregateAssessmentDueRecord[]> {
  const scoped = createScopedClient(communityId);
  const filters = [
    inArray(assessmentLineItems.status, ['pending', 'overdue']),
  ];

  if (range) {
    filters.push(gte(assessmentLineItems.dueDate, range.start));
    filters.push(lte(assessmentLineItems.dueDate, range.end));
  }

  const lineItems = await scoped.selectFrom<AssessmentLineItemRow>(
    assessmentLineItems,
    {
      id: assessmentLineItems.id,
      assessmentId: assessmentLineItems.assessmentId,
      unitId: assessmentLineItems.unitId,
      amountCents: assessmentLineItems.amountCents,
      dueDate: assessmentLineItems.dueDate,
      status: assessmentLineItems.status,
      lateFeeCents: assessmentLineItems.lateFeeCents,
    },
    filters.length === 1 ? filters[0] : and(...filters),
  );

  if (lineItems.length === 0) {
    return [];
  }

  const assessmentIds = [
    ...new Set(
      lineItems
        .map((row) => row.assessmentId)
        .filter((value): value is number => typeof value === 'number'),
    ),
  ];
  const assessmentRows = assessmentIds.length === 0
    ? []
    : await scoped.selectFrom<AssessmentRow>(
        assessments,
        {
          id: assessments.id,
          title: assessments.title,
        },
        inArray(assessments.id, assessmentIds),
      );
  const assessmentTitleById = new Map(
    assessmentRows.map((row) => [row.id, row.title]),
  );

  const buckets = new Map<string, AggregateAssessmentDueRecord & { unitIds: Set<number> }>();

  for (const row of lineItems) {
    if (typeof row.assessmentId !== 'number') {
      continue;
    }

    const key = `${row.assessmentId}:${row.dueDate}`;
    const current = buckets.get(key) ?? {
      assessmentId: row.assessmentId,
      dueDate: row.dueDate,
      assessmentTitle: assessmentTitleById.get(row.assessmentId) ?? 'Assessment Due',
      unitCount: 0,
      pendingCount: 0,
      totalAmountCents: 0,
      unitIds: new Set<number>(),
    };

    current.unitIds.add(row.unitId);
    current.pendingCount += (row.status === 'pending' || row.status === 'overdue') ? 1 : 0;
    current.totalAmountCents += row.amountCents + row.lateFeeCents;
    buckets.set(key, current);
  }

  return [...buckets.values()]
    .map((entry) => ({
      assessmentId: entry.assessmentId,
      dueDate: entry.dueDate,
      assessmentTitle: entry.assessmentTitle,
      unitCount: entry.unitIds.size,
      pendingCount: entry.pendingCount,
      totalAmountCents: entry.totalAmountCents,
    }))
    .sort((left, right) =>
      left.dueDate.localeCompare(right.dueDate)
      || left.assessmentTitle.localeCompare(right.assessmentTitle),
    );
}

export async function listOwnerAssessmentDueRecords(
  communityId: number,
  actorUserId: string,
  range?: { start: string; end: string },
): Promise<OwnerAssessmentDueRecord[]> {
  const scoped = createScopedClient(communityId);
  const actorUnitIds = await listActorUnitIds(scoped, actorUserId);

  if (actorUnitIds.length === 0) {
    return [];
  }

  const filters = [inArray(assessmentLineItems.unitId, actorUnitIds)];

  if (range) {
    filters.push(gte(assessmentLineItems.dueDate, range.start));
    filters.push(lte(assessmentLineItems.dueDate, range.end));
  }

  const lineItems = await scoped
    .selectFrom<AssessmentLineItemRow>(
      assessmentLineItems,
      {
        id: assessmentLineItems.id,
        assessmentId: assessmentLineItems.assessmentId,
        unitId: assessmentLineItems.unitId,
        amountCents: assessmentLineItems.amountCents,
        dueDate: assessmentLineItems.dueDate,
        status: assessmentLineItems.status,
        lateFeeCents: assessmentLineItems.lateFeeCents,
      },
      filters.length === 1 ? filters[0] : and(...filters),
    )
    .orderBy(asc(assessmentLineItems.dueDate), asc(assessmentLineItems.id));

  if (lineItems.length === 0) {
    return [];
  }

  const assessmentIds = [
    ...new Set(
      lineItems
        .map((row) => row.assessmentId)
        .filter((value): value is number => typeof value === 'number'),
    ),
  ];
  const [assessmentRows, unitRows] = await Promise.all([
    assessmentIds.length === 0
      ? Promise.resolve([] as AssessmentRow[])
      : scoped.selectFrom<AssessmentRow>(
          assessments,
          {
            id: assessments.id,
            title: assessments.title,
          },
          inArray(assessments.id, assessmentIds),
        ),
    scoped.selectFrom<UnitLabelRow>(
      units,
      {
        id: units.id,
        unitNumber: units.unitNumber,
        building: units.building,
      },
      inArray(units.id, actorUnitIds),
    ),
  ]);

  const assessmentTitleById = new Map(
    assessmentRows.map((row) => [row.id, row.title]),
  );
  const unitLabelById = new Map(
    unitRows.map((row) => [row.id, formatUnitLabel(row)]),
  );

  return lineItems.map((row) => ({
    assessmentId: row.assessmentId ?? 0,
    dueDate: row.dueDate,
    assessmentTitle: row.assessmentId
      ? assessmentTitleById.get(row.assessmentId) ?? 'Assessment Due'
      : 'Assessment Due',
    amountCents: row.amountCents + row.lateFeeCents,
    status: row.status,
    unitLabel: unitLabelById.get(row.unitId) ?? `Unit ${row.unitId}`,
  }));
}
