import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
);
vi.mock('next/navigation', () => ({ redirect: redirectMock }));

import WebsiteOnboardingRedirectPage from '../../src/app/(authenticated)/pm/onboarding/website/page';

const visit = (communityId?: string) =>
  WebsiteOnboardingRedirectPage({
    searchParams: Promise.resolve(communityId === undefined ? {} : { communityId }),
  });

describe('/pm/onboarding/website (retired wizard)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends the old wizard URL to the website home for the same community', async () => {
    await expect(visit('42')).rejects.toThrow('NEXT_REDIRECT:/pm/website?communityId=42');
    expect(redirectMock).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, '', 'abc', '0', '-3', '4.5'])(
    'sends a visit with no usable community (%s) to the portfolio',
    async (value) => {
      await expect(visit(value)).rejects.toThrow('NEXT_REDIRECT:/pm/dashboard/communities');
    },
  );
});
