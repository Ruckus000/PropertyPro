import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: vi.fn().mockResolvedValue('user-123'),
}));
vi.mock('@/lib/api/pm-communities', () => ({
  isPmAdminInAnyCommunity: vi.fn().mockResolvedValue(true),
}));
vi.mock('@propertypro/db/unsafe', () => ({
  isPmAdminInAnyCommunity: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/lib/auth/signup', () => ({
  checkSignupSubdomainAvailability: vi.fn().mockResolvedValue({
    available: true,
    normalizedSubdomain: 'oceanview-towers',
    reason: 'available',
    message: 'Available',
  }),
}));
vi.mock('@/lib/pm/create-community', () => ({
  createCommunityForPm: vi.fn().mockResolvedValue({ communityId: 99, slug: 'oceanview-towers' }),
}));

import { POST } from '@/app/api/v1/pm/communities/route';
import { createCommunityForPm } from '@/lib/pm/create-community';

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/v1/pm/communities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  name: 'Oceanview Towers',
  communityType: 'condo_718',
  addressLine1: '123 Ocean Blvd',
  city: 'Miami',
  state: 'FL',
  zipCode: '33139',
  subdomain: 'oceanview-towers',
  timezone: 'America/New_York',
  unitCount: 48,
};

describe('POST /api/v1/pm/communities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a community with valid input', async () => {
    const res = await POST(makeRequest(validBody));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.data).toEqual({ communityId: 99, slug: 'oceanview-towers' });
    expect(createCommunityForPm).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Oceanview Towers', userId: 'user-123' }),
    );
  });

  it('rejects missing required fields', async () => {
    const res = await POST(makeRequest({ name: 'Test' }));
    expect(res.status).toBe(400);
  });

  it('rejects invalid community type', async () => {
    const res = await POST(makeRequest({ ...validBody, communityType: 'invalid' }));
    expect(res.status).toBe(400);
  });
});
