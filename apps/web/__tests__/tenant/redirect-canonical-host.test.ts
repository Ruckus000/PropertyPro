import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redirectMock, notFoundMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFoundMock: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock, notFound: notFoundMock }));

import { redirectToCanonicalHost } from '../../src/lib/tenant/redirect-canonical-host';

describe('redirectToCanonicalHost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'getpropertypro.com');
  });

  it('redirects a well-formed slug to its canonical host', () => {
    expect(() => redirectToCanonicalHost('sunset-condos', '/notices')).toThrow(
      'REDIRECT:https://sunset-condos.getpropertypro.com/notices',
    );
  });

  it('lowercases a mixed-case slug (hostnames are case-insensitive)', () => {
    expect(() => redirectToCanonicalHost('Sunset-Condos')).toThrow(
      'REDIRECT:https://sunset-condos.getpropertypro.com/',
    );
  });

  it.each([
    'favicon.ico.evil.com/#',
    'evil.com/',
    'evil.com#',
    '-leading-dash',
    '',
    'a b',
  ])('refuses %j instead of building a redirect from it', (slug) => {
    expect(() => redirectToCanonicalHost(slug, '/notices')).toThrow('NOT_FOUND');
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
