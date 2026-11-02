// @vitest-environment jsdom
/**
 * useNavBadges — the badge reads shared by the side rail and the top tab bar.
 * The hooks underneath are mocked so this pins the ENABLEMENT rules and the
 * zero-when-hidden behaviour, not the network.
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFeaturesForCommunity, type CommunityRole, type CommunityType } from '@propertypro/shared';
import { useNavBadges } from '@/components/layout/use-nav-badges';

const { joinRequestsMock, recordsAlertMock } = vi.hoisted(() => ({
  joinRequestsMock: vi.fn(),
  recordsAlertMock: vi.fn(),
}));

vi.mock('@/hooks/use-admin-join-requests', () => ({ useAdminJoinRequests: joinRequestsMock }));
vi.mock('@/hooks/use-records-alert', () => ({ useRecordsAlert: recordsAlertMock }));

type Args = Parameters<typeof useNavBadges>[0];

function args(overrides: Partial<Args> = {}): Args {
  return {
    communityId: 7,
    role: 'property_manager' as CommunityRole,
    communityType: 'condo_718' as CommunityType,
    features: getFeaturesForCommunity('condo_718'),
    isPmContext: false,
    lapsedAdmin: false,
    ...overrides,
  };
}

const requestsEnabled = () => joinRequestsMock.mock.calls.at(-1)?.[0]?.enabled;
const recordsEnabled = () => recordsAlertMock.mock.calls.at(-1)?.[1]?.enabled;

describe('useNavBadges', () => {
  beforeEach(() => {
    joinRequestsMock.mockReset();
    recordsAlertMock.mockReset();
    joinRequestsMock.mockReturnValue({ data: [{ id: 1 }, { id: 2 }] });
    recordsAlertMock.mockReturnValue({ data: { snoozedUntil: null, missingCount: 3 } });
  });

  it('returns both counts for a manager of a covered condo, and enables both reads', () => {
    const { result } = renderHook(() => useNavBadges(args()));
    expect(result.current).toEqual({ pendingJoinRequests: 2, missingRecords: 3 });
    expect(joinRequestsMock).toHaveBeenCalledWith({ communityId: 7, enabled: true });
    expect(recordsAlertMock).toHaveBeenCalledWith(7, { enabled: true, staleTime: 5 * 60 * 1000 });
  });

  it('counts records for an HOA root manager too', () => {
    const { result } = renderHook(() =>
      useNavBadges(args({ role: 'root_manager', communityType: 'hoa_720', features: getFeaturesForCommunity('hoa_720') })),
    );
    expect(result.current.missingRecords).toBe(3);
  });

  it('gives a resident zeros and disables both reads, even if data is cached', () => {
    const { result } = renderHook(() => useNavBadges(args({ role: 'resident' })));
    expect(result.current).toEqual({ pendingJoinRequests: 0, missingRecords: 0 });
    expect(requestsEnabled()).toBe(false);
    expect(recordsEnabled()).toBe(false);
  });

  it('gives zeros with no role or no community', () => {
    expect(renderHook(() => useNavBadges(args({ role: null }))).result.current).toEqual({
      pendingJoinRequests: 0,
      missingRecords: 0,
    });
    const noCommunity = renderHook(() => useNavBadges(args({ communityId: null })));
    expect(noCommunity.result.current).toEqual({ pendingJoinRequests: 0, missingRecords: 0 });
    expect(joinRequestsMock).toHaveBeenLastCalledWith({ communityId: undefined, enabled: false });
    expect(recordsAlertMock.mock.calls.at(-1)?.[0]).toBe(0);
  });

  it('turns the records badge off for an apartment, keeping join requests', () => {
    const { result } = renderHook(() =>
      useNavBadges(args({ communityType: 'apartment', features: getFeaturesForCommunity('apartment') })),
    );
    expect(result.current).toEqual({ pendingJoinRequests: 2, missingRecords: 0 });
    expect(requestsEnabled()).toBe(true);
    expect(recordsEnabled()).toBe(false);
  });

  it('turns the records badge off without hasSiteEditor, or without loaded features', () => {
    const noEditor = { ...getFeaturesForCommunity('condo_718'), hasSiteEditor: false };
    const a = renderHook(() => useNavBadges(args({ features: noEditor })));
    expect(a.result.current).toEqual({ pendingJoinRequests: 2, missingRecords: 0 });
    expect(recordsEnabled()).toBe(false);

    const b = renderHook(() => useNavBadges(args({ features: null })));
    expect(b.result.current.missingRecords).toBe(0);
    expect(recordsEnabled()).toBe(false);
  });

  it('gives zeros in PM portfolio context', () => {
    const { result } = renderHook(() => useNavBadges(args({ isPmContext: true })));
    expect(result.current).toEqual({ pendingJoinRequests: 0, missingRecords: 0 });
    expect(requestsEnabled()).toBe(false);
    expect(recordsEnabled()).toBe(false);
  });

  it('gives zeros for an admin on a lapsed community', () => {
    const { result } = renderHook(() => useNavBadges(args({ lapsedAdmin: true })));
    expect(result.current).toEqual({ pendingJoinRequests: 0, missingRecords: 0 });
    expect(requestsEnabled()).toBe(false);
    expect(recordsEnabled()).toBe(false);
  });

  it('treats a not-yet-loaded read as zero', () => {
    joinRequestsMock.mockReturnValue({ data: undefined });
    recordsAlertMock.mockReturnValue({ data: undefined });
    const { result } = renderHook(() => useNavBadges(args()));
    expect(result.current).toEqual({ pendingJoinRequests: 0, missingRecords: 0 });
  });
});
