/**
 * Preview-data selectors.
 *
 * These are what make the canvas honest: the editor holds one superset per SoR
 * type and narrows it with the block's config, so what the canvas shows has to
 * match what the published query would return. Every case here is a way that
 * could silently diverge.
 */
import { describe, it, expect } from 'vitest';
import {
  selectAnnouncements,
  selectContact,
  selectDocuments,
  selectMeetings,
  EMPTY_PREVIEW_DATA,
  PREVIEW_LIMIT,
  PREVIEW_WINDOW_DAYS,
} from '@/lib/site-editor/preview-data';

const NOW = new Date('2026-06-15T12:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

const announcement = (id: number, daysAgo: number) =>
  ({
    id,
    title: `A${id}`,
    body: '',
    bodyHtml: '',
    isPinned: false,
    publishedAt: new Date(NOW - daysAgo * DAY),
  }) as never;

const meeting = (id: number, daysAhead: number) =>
  ({
    id,
    title: `M${id}`,
    meetingType: 'board_meeting',
    startsAt: new Date(NOW + daysAhead * DAY),
    endsAt: null,
    location: '',
  }) as never;

const doc = (id: number, categoryName: string | null) =>
  ({
    id,
    title: `D${id}`,
    description: null,
    filePath: '',
    fileName: '',
    categoryName,
    createdAt: new Date(NOW),
  }) as never;

describe('selectAnnouncements', () => {
  const all = [announcement(1, 1), announcement(2, 10), announcement(3, 45), announcement(4, 200)];

  it('keeps only items inside the window', () => {
    const out = selectAnnouncements({ limit: 20, timeWindowDays: 30 }, all, NOW);
    expect(out.map((a) => a.id)).toEqual([1, 2]);
  });

  it('applies the limit after the window', () => {
    const out = selectAnnouncements({ limit: 1, timeWindowDays: 30 }, all, NOW);
    expect(out.map((a) => a.id)).toEqual([1]);
  });

  it('preserves the superset order rather than re-sorting', () => {
    // The reader orders pinned-first then newest; re-sorting here would make
    // the canvas disagree with the published page.
    const pinnedOld = { ...(announcement(9, 20) as object), isPinned: true } as never;
    const out = selectAnnouncements({ limit: 20, timeWindowDays: 30 }, [pinnedOld, ...all], NOW);
    expect(out.map((a) => a.id)).toEqual([9, 1, 2]);
  });

  it('includes an item exactly on the window boundary', () => {
    const out = selectAnnouncements({ limit: 20, timeWindowDays: 10 }, all, NOW);
    expect(out.map((a) => a.id)).toContain(2);
  });

  it('returns nothing when the superset is empty', () => {
    expect(selectAnnouncements({ limit: 5, timeWindowDays: 30 }, [], NOW)).toEqual([]);
  });
});

describe('selectMeetings', () => {
  const all = [meeting(1, 2), meeting(2, 20), meeting(3, 90)];

  it('keeps meetings starting inside the forward window', () => {
    const out = selectMeetings({ limit: 20, timeWindowDays: 30 }, all, NOW);
    expect(out.map((m) => m.id)).toEqual([1, 2]);
  });

  it('applies the limit after the window', () => {
    const out = selectMeetings({ limit: 1, timeWindowDays: 30 }, all, NOW);
    expect(out.map((m) => m.id)).toEqual([1]);
  });

  it('widens with the window rather than dropping far-future meetings', () => {
    const out = selectMeetings({ limit: 20, timeWindowDays: 365 }, all, NOW);
    expect(out).toHaveLength(3);
  });
});

describe('selectDocuments', () => {
  const all = [doc(1, 'budget'), doc(2, 'minutes'), doc(3, null), doc(4, 'rules')];

  it('treats an empty category list as "all categories"', () => {
    // Matches the public renderer's convention — an empty list is not "none".
    const out = selectDocuments({ limit: 20, includeCategories: [] as never }, all);
    expect(out).toHaveLength(4);
  });

  it('filters to the selected categories', () => {
    const out = selectDocuments({ limit: 20, includeCategories: ['budget', 'rules'] as never }, all);
    expect(out.map((d) => d.id)).toEqual([1, 4]);
  });

  it('excludes uncategorised documents once a filter is set', () => {
    // A document with no category has no name to match, so it can only appear
    // in the all-categories case.
    const out = selectDocuments({ limit: 20, includeCategories: ['budget'] as never }, all);
    expect(out.map((d) => d.id)).not.toContain(3);
  });

  it('applies the limit after filtering', () => {
    const out = selectDocuments({ limit: 1, includeCategories: ['budget', 'rules'] as never }, all);
    expect(out.map((d) => d.id)).toEqual([1]);
  });

  it('tolerates a missing category list', () => {
    const out = selectDocuments({ limit: 20, includeCategories: undefined as never }, all);
    expect(out).toHaveLength(4);
  });
});

describe('selectContact', () => {
  const all = {
    management: { name: 'Coastal', email: 'a@b.com', phone: '305' },
    board: [{ name: 'Sam', title: 'President' }],
  };

  it('shows both sides when both toggles are on', () => {
    const out = selectContact({ showManagement: true, showBoard: true }, all);
    expect(out.management).not.toBeNull();
    expect(out.board).toHaveLength(1);
  });

  it('hides management when its toggle is off', () => {
    // The superset is always fetched with both sides on, so masking here is the
    // only thing stopping the canvas showing details the live page does not.
    const out = selectContact({ showManagement: false, showBoard: true }, all);
    expect(out.management).toBeNull();
    expect(out.board).toHaveLength(1);
  });

  it('hides the board when its toggle is off', () => {
    const out = selectContact({ showManagement: true, showBoard: false }, all);
    expect(out.management).not.toBeNull();
    expect(out.board).toEqual([]);
  });

  it('hides everything when both are off', () => {
    const out = selectContact({ showManagement: false, showBoard: false }, all);
    expect(out).toEqual({ management: null, board: [] });
  });
});

describe('superset bounds', () => {
  it('exceeds the largest limit and window any block can request', () => {
    // sorLimitSchema caps a block's limit at 20; the window schemas cap at 365.
    // If those caps ever rise above these constants, the canvas starts lying.
    expect(PREVIEW_LIMIT).toBeGreaterThan(20);
    expect(PREVIEW_WINDOW_DAYS).toBeGreaterThanOrEqual(365);
  });

  it('ships an empty shape with every key present', () => {
    expect(Object.keys(EMPTY_PREVIEW_DATA).sort()).toEqual([
      'announcements',
      'contact',
      'documents',
      'meetings',
    ]);
  });
});
