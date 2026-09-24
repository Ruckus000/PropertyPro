import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, createScopedClientMock } = vi.hoisted(() => {
  const queryMock = vi.fn();
  return { queryMock, createScopedClientMock: vi.fn(() => ({ query: queryMock })) };
});

vi.mock('@propertypro/db', () => ({
  communities: { __table: 'communities' },
  createScopedClient: createScopedClientMock,
}));

vi.mock('@/lib/utils/url', () => ({ getBaseUrl: () => 'https://app.example.com' }));

import { loadEmailBranding } from '@/lib/services/email-branding';

const community = {
  id: 7,
  name: 'Sunset Palms HOA',
  addressLine1: '1400 Gulf Shore Blvd N',
  addressLine2: null,
  city: 'Naples',
  state: 'FL',
  zipCode: '34102',
};

describe('loadEmailBranding', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('links the footer to the community-scoped notification settings page', async () => {
    queryMock.mockResolvedValue([community]);

    const branding = await loadEmailBranding(7);

    expect(createScopedClientMock).toHaveBeenCalledWith(7);
    expect(branding.preferencesUrl).toBe('https://app.example.com/settings?communityId=7');
    expect(branding.communityName).toBe('Sunset Palms HOA');
    expect(branding.postalAddressLines).toBeDefined();
  });

  it('keeps the preferences link when the postal address is incomplete', async () => {
    queryMock.mockResolvedValue([{ ...community, city: null }]);

    const branding = await loadEmailBranding(7);

    expect(branding.postalAddressLines).toBeUndefined();
    expect(branding.preferencesUrl).toBe('https://app.example.com/settings?communityId=7');
  });

  it('sets no preferences link when the community is not found', async () => {
    queryMock.mockResolvedValue([]);

    const branding = await loadEmailBranding(7);

    expect(branding).toEqual({ communityName: 'PropertyPro' });
  });

  it('never sets an unsubscribe link — that stays per-recipient at each sender', async () => {
    queryMock.mockResolvedValue([community]);

    const branding = await loadEmailBranding(7);

    expect(branding.unsubscribeUrl).toBeUndefined();
  });
});
