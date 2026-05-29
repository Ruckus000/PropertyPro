import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted DB mocks. branding.ts queries `communities` by primary key through
// the unscoped client (communities is the root tenant table — no
// communityId column to scope on).
// ---------------------------------------------------------------------------

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();

const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockUpdateWhere = vi.fn();

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => ({
    select: mockSelect,
    update: mockUpdate,
  }),
}));

vi.mock('@propertypro/db', () => ({
  communities: {
    id: 'communities.id',
    siteOnboardingCompletedAt: 'communities.siteOnboardingCompletedAt',
  },
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...args: unknown[]) => ({ type: 'and', args }),
  eq: (a: unknown, b: unknown) => ({ type: 'eq', a, b }),
  isNull: (a: unknown) => ({ type: 'isNull', a }),
}));

import {
  getSiteOnboardingCompletedAt,
  markSiteOnboardingComplete,
} from '@/lib/api/branding';

function setupSelect(result: unknown[]) {
  mockLimit.mockResolvedValue(result);
  mockWhere.mockReturnValue({ limit: mockLimit });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockSelect.mockReturnValue({ from: mockFrom });
}

function setupUpdate() {
  mockUpdateWhere.mockResolvedValue(undefined);
  mockSet.mockReturnValue({ where: mockUpdateWhere });
  mockUpdate.mockReturnValue({ set: mockSet });
}

describe('getSiteOnboardingCompletedAt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the completion timestamp when set', async () => {
    const ts = new Date('2026-05-29T10:00:00.000Z');
    setupSelect([{ completedAt: ts }]);
    const result = await getSiteOnboardingCompletedAt(42);
    expect(result).toBe(ts);
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });

  it('returns null when the column is NULL (wizard never completed)', async () => {
    setupSelect([{ completedAt: null }]);
    const result = await getSiteOnboardingCompletedAt(42);
    expect(result).toBeNull();
  });

  it('returns null when the community row is missing', async () => {
    setupSelect([]);
    const result = await getSiteOnboardingCompletedAt(999);
    expect(result).toBeNull();
  });
});

describe('markSiteOnboardingComplete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupUpdate();
  });

  it('updates communities with a fresh completion timestamp', async () => {
    const before = Date.now();
    await markSiteOnboardingComplete(42);
    const after = Date.now();

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const setArg = mockSet.mock.calls[0][0] as { siteOnboardingCompletedAt: Date };
    expect(setArg.siteOnboardingCompletedAt).toBeInstanceOf(Date);
    const stampedMs = setArg.siteOnboardingCompletedAt.getTime();
    expect(stampedMs).toBeGreaterThanOrEqual(before);
    expect(stampedMs).toBeLessThanOrEqual(after);

    // Scopes the write to the target community by primary key.
    expect(mockUpdateWhere).toHaveBeenCalledWith({
      type: 'eq',
      a: 'communities.id',
      b: 42,
    });
  });
});
