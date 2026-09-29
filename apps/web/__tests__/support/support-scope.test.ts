import { describe, expect, it, vi } from 'vitest';

const { headersMock } = vi.hoisted(() => ({ headersMock: vi.fn() }));
vi.mock('next/headers', () => ({ headers: headersMock }));

import {
  getPageSupportScope,
  getSupportScope,
  narrowToSupportScope,
  refuseUnderSupportSession,
} from '@/lib/support/support-scope';
import { ForbiddenError } from '@/lib/api/errors';

function h(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe('getSupportScope', () => {
  it('returns null when the request is not a support session', () => {
    expect(getSupportScope(h({}))).toBeNull();
    // A tenant header alone is an ordinary request.
    expect(getSupportScope(h({ 'x-community-id': '7' }))).toBeNull();
    // So is a stray community stamp without a session id.
    expect(getSupportScope(h({ 'x-support-community-id': '7' }))).toBeNull();
  });

  it('returns the consented community for a valid support session', () => {
    expect(
      getSupportScope(h({ 'x-support-session-id': '42', 'x-support-community-id': '7' })),
    ).toEqual({ communityId: 7 });
  });

  it('accepts an agreeing x-community-id', () => {
    expect(
      getSupportScope(
        h({ 'x-support-session-id': '42', 'x-support-community-id': '7', 'x-community-id': '7' }),
      ),
    ).toEqual({ communityId: 7 });
  });

  it('fails closed (communityId null) when the session community is missing', () => {
    expect(getSupportScope(h({ 'x-support-session-id': '42' }))).toEqual({ communityId: null });
    // x-community-id is NOT a substitute: the TENANT_OPTIONAL_PATHS never carry it,
    // so relying on it would make the scope path-dependent.
    expect(getSupportScope(h({ 'x-support-session-id': '42', 'x-community-id': '7' }))).toEqual({
      communityId: null,
    });
  });

  it.each(['abc', '0', '-3', '1.5', '', '   ', 'NaN'])(
    'fails closed (communityId null) on a garbage session community %j',
    (value) => {
      expect(
        getSupportScope(h({ 'x-support-session-id': '42', 'x-support-community-id': value })),
      ).toEqual({ communityId: null });
    },
  );

  it('fails closed when x-community-id disagrees with the session community', () => {
    expect(
      getSupportScope(
        h({ 'x-support-session-id': '42', 'x-support-community-id': '7', 'x-community-id': '8' }),
      ),
    ).toEqual({ communityId: null });
    expect(
      getSupportScope(
        h({ 'x-support-session-id': '42', 'x-support-community-id': '7', 'x-community-id': 'junk' }),
      ),
    ).toEqual({ communityId: null });
  });
});

describe('getPageSupportScope', () => {
  it('reads the current request headers', async () => {
    headersMock.mockResolvedValueOnce(
      h({ 'x-support-session-id': '42', 'x-support-community-id': '7' }),
    );
    await expect(getPageSupportScope()).resolves.toEqual({ communityId: 7 });

    headersMock.mockResolvedValueOnce(h({}));
    await expect(getPageSupportScope()).resolves.toBeNull();
  });
});

describe('narrowToSupportScope', () => {
  const rows = [{ c: 1 }, { c: 7 }, { c: 9 }, { c: 7 }];
  const id = (r: { c: number }) => r.c;

  it('is the identity outside a support session', () => {
    expect(narrowToSupportScope(rows, null, id)).toEqual(rows);
  });

  it('keeps only the scoped community', () => {
    expect(narrowToSupportScope(rows, { communityId: 7 }, id)).toEqual([{ c: 7 }, { c: 7 }]);
  });

  it('returns nothing when the scope community is unknown', () => {
    expect(narrowToSupportScope(rows, { communityId: null }, id)).toEqual([]);
  });
});

describe('refuseUnderSupportSession', () => {
  it('throws 403 during a support session and passes otherwise', () => {
    expect(() =>
      refuseUnderSupportSession(h({ 'x-support-session-id': '42', 'x-support-community-id': '7' })),
    ).toThrow(ForbiddenError);
    expect(() => refuseUnderSupportSession(h({ 'x-support-session-id': '42' }))).toThrow(
      'Not available during a support session',
    );
    expect(() => refuseUnderSupportSession(h({}))).not.toThrow();
  });
});
