/**
 * `use-denied-visitors` goes through the shared `requestJson` (audit R-06), so a
 * failed denied-visitor request carries the server's structured detail like
 * every other hook, instead of a bare `Error` from a private copy.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/lib/api/request-json';
import { fetchDeniedMatches } from '@/hooks/use-denied-visitors';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchDeniedMatches', () => {
  it('unwraps the { data } envelope', async () => {
    const match = { id: 3, fullName: 'Chris Vaughn', vehiclePlate: null, reason: 'Trespass', isActive: true };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: [match] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDeniedMatches(7, ' Chris ', null)).resolves.toEqual([match]);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/visitors/denied/match?communityId=7&name=Chris', undefined);
  });

  it('rejects with ApiRequestError carrying status and code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(403, { error: { message: 'Not allowed', code: 'FORBIDDEN' } }),
      ),
    );

    const error = await fetchDeniedMatches(7, 'Chris', null).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ message: 'Not allowed', status: 403, code: 'FORBIDDEN' });
  });
});
