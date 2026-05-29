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
  siteLayoutMetadata: {
    slug: 'siteLayoutMetadata.slug',
    defaultPresetSlug: 'siteLayoutMetadata.defaultPresetSlug',
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
  seedDefaultSiteBranding,
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

describe('seedDefaultSiteBranding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Wire both the select and update chains; tests vary mockLimit per call.
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockUpdateWhere.mockResolvedValue(undefined);
    mockSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockSet });
  });

  it('seeds layoutId (from community type) + themePresetSlug (layout default) for a fresh community', async () => {
    mockLimit
      // 1) getBrandingForCommunity → no existing branding
      .mockResolvedValueOnce([{ branding: null }])
      // 2) site_layout_metadata read → tidewater's default preset
      .mockResolvedValueOnce([{ defaultPresetSlug: 'bay-light' }])
      // 3) updateBrandingForCommunity's internal getBranding → still empty
      .mockResolvedValueOnce([{ branding: null }]);

    await seedDefaultSiteBranding(7, 'condo_718');

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const setArg = mockSet.mock.calls[0][0] as { branding: Record<string, unknown> };
    expect(setArg.branding).toEqual({ layoutId: 'tidewater', themePresetSlug: 'bay-light' });
  });

  it('maps hoa_720 → boulevard and apartment → sable', async () => {
    // hoa_720
    mockLimit
      .mockResolvedValueOnce([{ branding: null }])
      .mockResolvedValueOnce([{ defaultPresetSlug: 'palm-shadow' }])
      .mockResolvedValueOnce([{ branding: null }]);
    await seedDefaultSiteBranding(8, 'hoa_720');
    expect((mockSet.mock.calls[0][0] as { branding: Record<string, unknown> }).branding).toEqual({
      layoutId: 'boulevard',
      themePresetSlug: 'palm-shadow',
    });

    vi.clearAllMocks();
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockSet });
    mockUpdateWhere.mockResolvedValue(undefined);

    // apartment
    mockLimit
      .mockResolvedValueOnce([{ branding: null }])
      .mockResolvedValueOnce([{ defaultPresetSlug: 'linen-bronze' }])
      .mockResolvedValueOnce([{ branding: null }]);
    await seedDefaultSiteBranding(9, 'apartment');
    expect((mockSet.mock.calls[0][0] as { branding: Record<string, unknown> }).branding).toEqual({
      layoutId: 'sable',
      themePresetSlug: 'linen-bronze',
    });
  });

  it('no-ops when the community already has a layoutId (never clobbers a PM choice)', async () => {
    mockLimit.mockResolvedValueOnce([{ branding: { layoutId: 'sable', themePresetSlug: 'x' } }]);

    await seedDefaultSiteBranding(7, 'condo_718');

    // Returned before the layout read or any update.
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('no-ops for an unknown community type', async () => {
    mockLimit.mockResolvedValueOnce([{ branding: null }]);

    await seedDefaultSiteBranding(7, 'unknown_type');

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('writes themePresetSlug=null when the layout has no default preset row', async () => {
    mockLimit
      .mockResolvedValueOnce([{ branding: null }])
      // layout row missing → no defaultPresetSlug
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ branding: null }]);

    await seedDefaultSiteBranding(7, 'condo_718');

    const setArg = mockSet.mock.calls[0][0] as { branding: Record<string, unknown> };
    expect(setArg.branding).toEqual({ layoutId: 'tidewater', themePresetSlug: null });
  });
});
