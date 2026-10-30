import { beforeEach, describe, expect, it, vi } from 'vitest';

const { applyLookMock, applyStarterPackMock, captureExceptionMock } = vi.hoisted(() => ({
  applyLookMock: vi.fn(),
  applyStarterPackMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

// The look service decides which look a type gets and publishes it
// (site-look-service.test.ts and new-community-look.integration.test.ts); this
// file is about the wrapper both creation paths call.
vi.mock('@/lib/services/site-look-service', () => ({
  applyLookAtCreation: applyLookMock,
}));
// What a new community used to get. It is mocked so a test can show it no
// longer runs, not so the wrapper can call it.
vi.mock('@/lib/services/starter-pack-service', () => ({
  applyStarterPackToCommunity: applyStarterPackMock,
}));
vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
}));

import { seedNewCommunitySite } from '../../../src/lib/services/new-community-site';

describe('seedNewCommunitySite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    applyLookMock.mockResolvedValue({ applied: true, lookId: 'bayfront' });
  });

  it('a condo gets the bayfront look with published sections', async () => {
    await seedNewCommunitySite(42, 'condo_718');

    // One call: the look service picks the look for the type and publishes its
    // layout, colours and sections together.
    expect(applyLookMock).toHaveBeenCalledTimes(1);
    expect(applyLookMock).toHaveBeenCalledWith(42, 'condo_718');
    expect(captureExceptionMock).not.toHaveBeenCalled();
    // The starter pack no longer runs: a pack on the type's legacy layout is
    // exactly what the look replaces.
    expect(applyStarterPackMock).not.toHaveBeenCalled();
  });

  it('an apartment gets plain & simple', async () => {
    applyLookMock.mockResolvedValue({ applied: true, lookId: 'plain-simple' });

    await seedNewCommunitySite(7, 'apartment');

    expect(applyLookMock).toHaveBeenCalledTimes(1);
    expect(applyLookMock).toHaveBeenCalledWith(7, 'apartment');
    expect(applyStarterPackMock).not.toHaveBeenCalled();
  });

  it('an HOA gets palm grove', async () => {
    applyLookMock.mockResolvedValue({ applied: true, lookId: 'palm-grove' });

    await seedNewCommunitySite(9, 'hoa_720');

    expect(applyLookMock).toHaveBeenCalledTimes(1);
    expect(applyLookMock).toHaveBeenCalledWith(9, 'hoa_720');
  });

  it('a failure is reported, never thrown', async () => {
    const err = new Error('colour set missing');
    applyLookMock.mockRejectedValue(err);

    await expect(seedNewCommunitySite(42, 'condo_718')).resolves.toBeUndefined();

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    expect(captureExceptionMock).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ tags: { site_seed: 'look' }, extra: { communityId: 42 } }),
    );
    // Logged too, and nothing falls back to the starter pack: a community that
    // just got created keeps whatever site a retry (or the editor) can finish.
    expect(console.error).toHaveBeenCalledWith('applyLookAtCreation failed', expect.objectContaining({ communityId: 42 }));
    expect(applyStarterPackMock).not.toHaveBeenCalled();
  });

  it('a community that already has a site is left as it is', async () => {
    // A provisioning retry: the look service skips a community with published
    // sections, and that is not a failure.
    applyLookMock.mockResolvedValue({ applied: false, lookId: 'bayfront' });

    await expect(seedNewCommunitySite(42, 'condo_718')).resolves.toBeUndefined();

    expect(captureExceptionMock).not.toHaveBeenCalled();
  });
});
