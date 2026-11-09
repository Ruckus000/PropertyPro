/**
 * /pm/settings/branding is retired. It sends a cached deep-link straight to the
 * website overview's Settings tab, which holds the logos and links to the
 * editor for the colours (design D), keeping a valid community id and nothing
 * else from the request.
 *
 * Revert check (production line): the `/pm/website?communityId=…&tab=settings`
 * target in `BrandingSettingsPage`.
 */
import { describe, expect, it, vi } from 'vitest';

const permanentRedirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
);
vi.mock('next/navigation', () => ({ permanentRedirect: permanentRedirectMock }));

import BrandingSettingsPage from '@/app/(authenticated)/pm/settings/branding/page';

function run(query: Record<string, string>) {
  return BrandingSettingsPage({ searchParams: Promise.resolve(query) });
}

describe('/pm/settings/branding', () => {
  it("goes to the website overview's Settings tab, keeping the community", async () => {
    await expect(run({ communityId: '7' })).rejects.toThrow(
      'NEXT_REDIRECT:/pm/website?communityId=7&tab=settings',
    );
  });

  it('goes to the community list when the id is missing or not a positive integer', async () => {
    for (const query of [{} as Record<string, string>, { communityId: 'abc' }, { communityId: '-3' }, { communityId: '1.5' }]) {
      await expect(run(query)).rejects.toThrow('NEXT_REDIRECT:/pm/dashboard/communities');
    }
  });
});
