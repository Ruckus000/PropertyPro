import { beforeEach, describe, expect, it, vi } from 'vitest';

const { applyStarterPackMock, seedBrandingMock, captureExceptionMock } = vi.hoisted(() => ({
  applyStarterPackMock: vi.fn(),
  seedBrandingMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock('@/lib/services/starter-pack-service', () => ({
  applyStarterPackToCommunity: applyStarterPackMock,
}));
vi.mock('@/lib/api/branding', () => ({
  seedDefaultSiteBranding: seedBrandingMock,
}));
vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
}));

import { seedNewCommunitySite } from '../../../src/lib/services/new-community-site';

describe('seedNewCommunitySite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    applyStarterPackMock.mockResolvedValue({ applied: true, blockCount: 5, packSlug: 'condo-v1' });
    seedBrandingMock.mockResolvedValue(undefined);
  });

  it('applies the starter pack and the default branding for the community type', async () => {
    await seedNewCommunitySite(42, 'hoa_720');
    expect(applyStarterPackMock).toHaveBeenCalledWith(42, 'hoa_720');
    expect(seedBrandingMock).toHaveBeenCalledWith(42, 'hoa_720');
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it('still seeds the branding when the starter pack fails, and reports the failure', async () => {
    const err = new Error('pack catalog unreachable');
    applyStarterPackMock.mockRejectedValue(err);
    await expect(seedNewCommunitySite(42, 'condo_718')).resolves.toBeUndefined();
    expect(seedBrandingMock).toHaveBeenCalledWith(42, 'condo_718');
    expect(captureExceptionMock).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ tags: { site_seed: 'starter_pack' } }),
    );
  });

  it('never throws when the branding fails, and reports it', async () => {
    const err = new Error('layout catalog unreachable');
    seedBrandingMock.mockRejectedValue(err);
    await expect(seedNewCommunitySite(42, 'apartment')).resolves.toBeUndefined();
    expect(captureExceptionMock).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ tags: { site_seed: 'branding' } }),
    );
  });
});
