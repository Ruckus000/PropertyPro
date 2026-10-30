/**
 * useUpdateCommunityUnitCount — what the query cache holds after a save.
 *
 * Two screens save the count (the site editor's requirements pill and the
 * Settings card), and the Settings card's profile read carries the count too.
 * Whichever screen saves, the cached profile must not go on showing the old
 * number. The card's own tests cover the Settings side; this covers the hook,
 * so the editor's save is covered as well.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { CommunityProfilePayload } from '@/app/api/v1/community/profile/contract';

const { requestJsonMock } = vi.hoisted(() => ({ requestJsonMock: vi.fn() }));

// Only the network call is faked: the error class stays real.
vi.mock('@/lib/api/request-json', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/request-json')>()),
  requestJson: requestJsonMock,
}));

import { useUpdateCommunityUnitCount } from '@/hooks/use-community-unit-count';

const COMMUNITY_ID = 42;
const KEY = ['community-profile', COMMUNITY_ID];

const PROFILE: CommunityProfilePayload = {
  name: 'Sunset Condominium Association',
  shortName: 'Sunset Condos',
  addressLine1: '123 Ocean Drive',
  addressLine2: null,
  city: 'Miami Beach',
  state: 'FL',
  zipCode: '33139',
  unitCount: 40,
  officeHours: null,
  contactName: null,
  contactEmail: null,
  contactPhone: null,
};

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useUpdateCommunityUnitCount(COMMUNITY_ID), { wrapper });
  /** The save, inside `act` because the mutation state is React state. */
  const save = (count: number) =>
    act(async () => {
      await result.current.mutateAsync(count);
    });
  return { client, save };
}

beforeEach(() => {
  requestJsonMock.mockReset();
});

describe('useUpdateCommunityUnitCount', () => {
  it('sends the count to its own route', async () => {
    requestJsonMock.mockResolvedValue({ unitCount: 20 });
    const { save } = setup();

    await save(20);

    expect(requestJsonMock).toHaveBeenCalledTimes(1);
    const [url, init] = requestJsonMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/community/unit-count');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ communityId: COMMUNITY_ID, unitCount: 20 });
  });

  it('puts the saved count into the cached profile and leaves the rest of it alone', async () => {
    requestJsonMock.mockResolvedValue({ unitCount: 20 });
    const { client, save } = setup();
    client.setQueryData(KEY, PROFILE);

    await save(20);

    expect(client.getQueryData(KEY)).toEqual({ ...PROFILE, unitCount: 20 });
  });

  it('takes the count from the server’s answer, not from what was sent', async () => {
    requestJsonMock.mockResolvedValue({ unitCount: 25 });
    const { client, save } = setup();
    client.setQueryData(KEY, PROFILE);

    await save(20);

    expect((client.getQueryData(KEY) as CommunityProfilePayload).unitCount).toBe(25);
  });

  it('does not invent a profile when none is cached', async () => {
    requestJsonMock.mockResolvedValue({ unitCount: 20 });
    const { client, save } = setup();

    await save(20);

    expect(client.getQueryData(KEY)).toBeUndefined();
    expect(client.getQueryCache().find({ queryKey: KEY })).toBeUndefined();
  });

  it('leaves another community’s cached profile alone', async () => {
    requestJsonMock.mockResolvedValue({ unitCount: 20 });
    const { client, save } = setup();
    client.setQueryData(['community-profile', 43], PROFILE);

    await save(20);

    expect(client.getQueryData(['community-profile', 43])).toEqual(PROFILE);
  });

  it('leaves the cached profile as it was when the save fails', async () => {
    requestJsonMock.mockRejectedValue(new Error('nope'));
    const { client, save } = setup();
    client.setQueryData(KEY, PROFILE);

    await expect(save(20)).rejects.toThrow('nope');

    expect(client.getQueryData(KEY)).toEqual(PROFILE);
  });
});
