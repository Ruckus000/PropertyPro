import { subMonths } from 'date-fns';
import {
  communities,
  complianceChecklistItems,
  createScopedClient,
  documents,
  meetings,
} from '@propertypro/db';
import {
  getComplianceTemplate,
  getFeaturesForCommunity,
  type CommunityType,
} from '@propertypro/shared';
import { z } from 'zod';
import { calculatePostingDeadline } from '@/lib/utils/compliance-calculator';
import { getNoticeLeadDays, type MeetingType } from '@/lib/utils/meeting-calculator';
import type { ResolvedCommunityRecord } from '@/lib/tenant/community-resolution';

export type TransparencyDocumentStatus = 'posted' | 'not_posted' | 'not_required';
export type TransparencyMinutesStatus = 'minutes_posted' | 'minutes_missing' | 'not_expected';

export interface TransparencyDocumentItem {
  templateKey: string;
  title: string;
  statuteReference: string;
  status: TransparencyDocumentStatus;
  postedAt: string | null;
  isConditional: boolean;
}

export interface TransparencyDocumentGroup {
  category: string;
  label: string;
  items: TransparencyDocumentItem[];
}

export interface TransparencyMeetingNotice {
  id: number;
  title: string;
  meetingType: MeetingType;
  startsAt: string;
  noticePostedAt: string | null;
  leadTimeHours: number | null;
  requiredLeadTimeHours: number;
  metRequirement: boolean | null;
}

export interface TransparencyMinutesMonth {
  month: string;
  label: string;
  hasMinutes: boolean;
  status: TransparencyMinutesStatus;
}

export interface TransparencyPageData {
  community: {
    id: number;
    slug: string;
    name: string;
    communityType: CommunityType;
    city: string | null;
    state: string | null;
    logoPath: string | null;
    timezone: string;
  };
  documents: TransparencyDocumentGroup[];
  meetingNotices: {
    meetings: TransparencyMeetingNotice[];
    ownerNoticeDays: number;
    boardNoticeHours: number;
  };
  minutesAvailability: {
    months: TransparencyMinutesMonth[];
    totalMonths: number;
    monthsWithMinutes: number;
  };
  portalStatus: {
    passwordProtected: boolean;
    individualCredentials: boolean;
    publicNoticesPage: boolean;
  };
  metadata: {
    generatedAt: string;
    dataSource: 'PropertyPro Platform';
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  governing_documents: 'Governing Documents',
  financial_records: 'Financial Records',
  meeting_records: 'Meeting Records',
  insurance: 'Insurance & Risk',
  operations: 'Contracts & Operations',
};

const CATEGORY_ORDER = [
  'governing_documents',
  'financial_records',
  'meeting_records',
  'insurance',
  'operations',
] as const;

const transparencyDocumentItemSchema = z.object({
  templateKey: z.string().min(1),
  title: z.string().min(1),
  statuteReference: z.string().min(1),
  status: z.enum(['posted', 'not_posted', 'not_required']),
  postedAt: z.string().datetime().nullable(),
  isConditional: z.boolean(),
});

const transparencyDocumentGroupSchema = z.object({
  category: z.string().min(1),
  label: z.string().min(1),
  items: z.array(transparencyDocumentItemSchema),
});

const transparencyMeetingNoticeSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  meetingType: z.enum(['board', 'annual', 'special', 'budget', 'committee']),
  startsAt: z.string().datetime(),
  noticePostedAt: z.string().datetime().nullable(),
  leadTimeHours: z.number().nullable(),
  requiredLeadTimeHours: z.number().int().nonnegative(),
  metRequirement: z.boolean().nullable(),
});

const transparencyMinutesMonthSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  label: z.string().min(1),
  hasMinutes: z.boolean(),
  status: z.enum(['minutes_posted', 'minutes_missing', 'not_expected']),
});

const transparencyPageDataSchema: z.ZodType<TransparencyPageData> = z.object({
  community: z.object({
    id: z.number().int().positive(),
    slug: z.string().min(1),
    name: z.string().min(1),
    communityType: z.enum(['condo_718', 'hoa_720', 'apartment']),
    city: z.string().nullable(),
    state: z.string().nullable(),
    logoPath: z.string().nullable(),
    timezone: z.string().min(1),
  }),
  documents: z.array(transparencyDocumentGroupSchema),
  meetingNotices: z.object({
    meetings: z.array(transparencyMeetingNoticeSchema),
    ownerNoticeDays: z.number().int().nonnegative(),
    boardNoticeHours: z.number().int().nonnegative(),
  }),
  minutesAvailability: z.object({
    months: z.array(transparencyMinutesMonthSchema),
    totalMonths: z.number().int().positive(),
    monthsWithMinutes: z.number().int().nonnegative(),
  }),
  portalStatus: z.object({
    passwordProtected: z.boolean(),
    individualCredentials: z.boolean(),
    publicNoticesPage: z.boolean(),
  }),
  metadata: z.object({
    generatedAt: z.string().datetime(),
    dataSource: z.literal('PropertyPro Platform'),
  }),
});

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function monthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  return `${year}-${month}`;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });
}

function coerceMeetingType(value: unknown): MeetingType {
  if (
    value === 'board'
    || value === 'annual'
    || value === 'special'
    || value === 'budget'
    || value === 'committee'
  ) {
    return value;
  }

  return 'board';
}

function toMeetingNotice(
  row: Record<string, unknown>,
  communityType: CommunityType,
): TransparencyMeetingNotice | null {
  const id = asNumber(row['id']);
  const title = asString(row['title']);
  const startsAt = asDate(row['startsAt']);
  if (!id || !title || !startsAt) {
    return null;
  }

  const meetingType = coerceMeetingType(row['meetingType']);
  const noticePostedAt = asDate(row['noticePostedAt']);
  const requiredLeadTimeHours = getNoticeLeadDays(meetingType, communityType) * 24;

  const leadTimeHours = noticePostedAt
    ? Math.round((startsAt.getTime() - noticePostedAt.getTime()) / 3_600_000)
    : null;

  return {
    id,
    title,
    meetingType,
    startsAt: startsAt.toISOString(),
    noticePostedAt: noticePostedAt ? noticePostedAt.toISOString() : null,
    leadTimeHours,
    requiredLeadTimeHours,
    metRequirement: leadTimeHours == null ? null : leadTimeHours >= requiredLeadTimeHours,
  };
}

function buildMinutesMonths(
  now: Date,
  meetingRows: ReadonlyArray<Record<string, unknown>>,
  documentRows: ReadonlyArray<Record<string, unknown>>,
): TransparencyMinutesMonth[] {
  const months: Array<{ key: string; date: Date }> = [];
  for (let offset = 11; offset >= 0; offset -= 1) {
    const monthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    months.push({ key: monthKey(monthDate), date: monthDate });
  }

  const monthSet = new Set(months.map((entry) => entry.key));

  const monthsWithMeetings = new Set<string>();
  for (const row of meetingRows) {
    const startsAt = asDate(row['startsAt']);
    if (!startsAt) continue;
    const key = monthKey(startsAt);
    if (monthSet.has(key)) {
      monthsWithMeetings.add(key);
    }
  }

  const monthsWithMinutes = new Set<string>();
  for (const row of documentRows) {
    const createdAt = asDate(row['createdAt']) ?? asDate(row['updatedAt']);
    if (!createdAt) continue;

    const haystack = [
      asString(row['title']) ?? '',
      asString(row['description']) ?? '',
      asString(row['fileName']) ?? '',
    ].join(' ').toLowerCase();

    if (!haystack.includes('minutes')) {
      continue;
    }

    const key = monthKey(createdAt);
    if (monthSet.has(key)) {
      monthsWithMinutes.add(key);
    }
  }

  return months.map(({ key, date }) => {
    const hasMeeting = monthsWithMeetings.has(key);
    const hasMinutes = monthsWithMinutes.has(key);

    let status: TransparencyMinutesStatus = 'not_expected';
    if (hasMinutes) {
      status = 'minutes_posted';
    } else if (hasMeeting) {
      status = 'minutes_missing';
    }

    return {
      month: key,
      label: monthLabel(date),
      hasMinutes,
      status,
    };
  });
}

function buildDocumentGroups(rows: ReadonlyArray<Record<string, unknown>>): TransparencyDocumentGroup[] {
  const grouped = new Map<string, TransparencyDocumentItem[]>();

  for (const [index, row] of rows.entries()) {
    const category = asString(row['category']) ?? 'operations';
    const rowId = asNumber(row['id']);
    const templateKey = asString(row['templateKey']) ?? `${category}-${rowId ?? index + 1}`;
    const title = asString(row['title']) ?? 'Checklist item';
    const statuteReference = asString(row['statuteReference']) ?? 'Florida Statute';
    const documentId = asNumber(row['documentId']);
    const postedAt = asDate(row['documentPostedAt']);
    const isConditional = asBoolean(row['isConditional']);

    const status: TransparencyDocumentStatus = documentId != null
      ? 'posted'
      : isConditional
        ? 'not_required'
        : 'not_posted';

    const item: TransparencyDocumentItem = {
      templateKey,
      title,
      statuteReference,
      status,
      postedAt: documentId != null && postedAt ? postedAt.toISOString() : null,
      isConditional,
    };

    const existing = grouped.get(category) ?? [];
    existing.push(item);
    grouped.set(category, existing);
  }

  return CATEGORY_ORDER
    .filter((category) => grouped.has(category))
    .map((category) => ({
      category,
      label: CATEGORY_LABELS[category] ?? category,
      items: (grouped.get(category) ?? []).sort((a, b) => a.title.localeCompare(b.title)),
    }));
}

export async function ensureTransparencyChecklistInitialized(
  communityId: number,
  communityType: CommunityType,
): Promise<Array<Record<string, unknown>>> {
  const scoped = createScopedClient(communityId);
  const existing = await scoped.query(complianceChecklistItems);

  const template = getComplianceTemplate(communityType);
  if (template.length === 0) {
    return existing;
  }

  const existingKeys = new Set(
    existing.map((row) => asString(row['templateKey'])).filter(Boolean),
  );

  const missingItems = template.filter(
    (item) => !existingKeys.has(item.templateKey),
  );

  if (missingItems.length === 0) {
    return existing;
  }

  const now = new Date();
  const rows = missingItems.map((item) => ({
    templateKey: item.templateKey,
    title: item.title,
    description: item.description,
    category: item.category,
    statuteReference: item.statuteReference,
    deadline: item.deadlineDays ? calculatePostingDeadline(now, item.deadlineDays) : null,
    rollingWindow: item.rollingMonths ? { months: item.rollingMonths } : null,
    isConditional: item.isConditional ?? false,
    documentId: null,
    documentPostedAt: null,
    lastModifiedBy: null,
  }));

  try {
    await scoped.insert(complianceChecklistItems, rows);
  } catch {
    // Ignore duplicate races; canonical state is read after insert attempt.
  }

  return scoped.query(complianceChecklistItems);
}

export async function getTransparencyPageData(
  community: ResolvedCommunityRecord,
): Promise<TransparencyPageData> {
  const scoped = createScopedClient(community.id);
  const [communityRows, checklistRows, meetingRows, documentRows] = await Promise.all([
    scoped.query(communities),
    ensureTransparencyChecklistInitialized(community.id, community.communityType),
    scoped.query(meetings),
    scoped.query(documents),
  ]);

  const communityRow = communityRows.find((row) => row['id'] === community.id) ?? null;
  const timezone = asString(communityRow?.['timezone']) ?? community.timezone;

  const now = new Date();
  const cutoff = subMonths(now, 12);
  const filteredMeetingRows = meetingRows.filter((row) => {
    const startsAt = asDate(row['startsAt']);
    return startsAt != null && startsAt >= cutoff && startsAt <= now;
  });

  const meetingNotices = filteredMeetingRows
    .map((row) => toMeetingNotice(row, community.communityType))
    .filter((value): value is TransparencyMeetingNotice => value != null)
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  const minuteMonths = buildMinutesMonths(new Date(), filteredMeetingRows, documentRows);
  const documentsByCategory = buildDocumentGroups(checklistRows);
  const features = getFeaturesForCommunity(community.communityType);

  const payload: TransparencyPageData = {
    community: {
      id: community.id,
      slug: community.slug,
      name: community.name,
      communityType: community.communityType,
      city: asString(communityRow?.['city']) ?? community.city,
      state: asString(communityRow?.['state']) ?? community.state,
      logoPath: asString(communityRow?.['logoPath']) ?? null,
      timezone,
    },
    documents: documentsByCategory,
    meetingNotices: {
      meetings: meetingNotices,
      ownerNoticeDays: getNoticeLeadDays('annual', community.communityType),
      boardNoticeHours: getNoticeLeadDays('board', community.communityType) * 24,
    },
    minutesAvailability: {
      months: minuteMonths,
      totalMonths: minuteMonths.length,
      monthsWithMinutes: minuteMonths.filter((month) => month.hasMinutes).length,
    },
    portalStatus: {
      passwordProtected: true,
      individualCredentials: true,
      publicNoticesPage: features.hasPublicNoticesPage,
    },
    metadata: {
      generatedAt: new Date().toISOString(),
      dataSource: 'PropertyPro Platform',
    },
  };

  return transparencyPageDataSchema.parse(payload);
}
