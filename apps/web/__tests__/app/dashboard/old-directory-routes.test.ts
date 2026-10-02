/**
 * /dashboard/units and /dashboard/residents moved permanently to the Directory:
 * 308 (permanentRedirect), every query parameter kept, the right tab chosen.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { permanentRedirectMock } = vi.hoisted(() => ({
  permanentRedirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

vi.mock('next/navigation', () => ({ permanentRedirect: permanentRedirectMock }));

import UnitsPage from '../../../src/app/(authenticated)/dashboard/units/page';
import ResidentsPage from '../../../src/app/(authenticated)/dashboard/residents/page';

describe('old Units / Residents routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('/dashboard/units → Directory Units tab, communityId kept', async () => {
    await expect(UnitsPage({ searchParams: Promise.resolve({ communityId: '7' }) })).rejects.toThrow('NEXT_REDIRECT');
    expect(permanentRedirectMock).toHaveBeenCalledWith('/dashboard/directory?communityId=7&tab=units');
  });

  it('/dashboard/residents → Directory Residents tab; other params (q) kept, a stale tab replaced', async () => {
    await expect(
      ResidentsPage({ searchParams: Promise.resolve({ communityId: '7', q: 'ana ruiz', tab: 'units' }) }),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(permanentRedirectMock).toHaveBeenCalledWith('/dashboard/directory?communityId=7&q=ana+ruiz&tab=residents');
  });

  it('no communityId (tenant subdomain): redirects anyway — the Directory resolves the host itself', async () => {
    await expect(UnitsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT');
    expect(permanentRedirectMock).toHaveBeenCalledWith('/dashboard/directory?tab=units');
  });
});
