/**
 * Unit tests for POST /api/v1/demo/[slug]/enter: a prospect's first entry fills
 * the demo's website with its suggested look, before the visitor is signed in.
 * What the fill does is site-look-service.test.ts and
 * new-community-look.integration.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  getDemoInstanceForEntryMock,
  createDemoSessionMock,
  emitConversionEventMock,
  fillDemoCommunitySiteMock,
} = vi.hoisted(() => ({
  getDemoInstanceForEntryMock: vi.fn(),
  createDemoSessionMock: vi.fn(),
  emitConversionEventMock: vi.fn(),
  fillDemoCommunitySiteMock: vi.fn(),
}));

vi.mock('@/lib/services/demo-conversion', () => ({
  getDemoInstanceForEntry: getDemoInstanceForEntryMock,
}));
vi.mock('@/lib/services/demo-session', () => ({
  createDemoSession: createDemoSessionMock,
}));
vi.mock('@/lib/services/conversion-events', () => ({
  emitConversionEvent: emitConversionEventMock,
}));
vi.mock('@/lib/services/site-look-service', () => ({
  fillDemoCommunitySite: fillDemoCommunitySiteMock,
}));

import { POST } from '../../src/app/api/v1/demo/[slug]/enter/route';

const INSTANCE = {
  id: 5,
  seededCommunityId: 42,
  demoResidentEmail: 'demo-resident@demo-harbor.example',
  demoBoardEmail: 'demo-board@demo-harbor.example',
  demoResidentUserId: 'resident-1',
  demoBoardUserId: 'board-1',
  isDemo: true,
  demoExpiresAt: new Date('2099-06-01'),
};

function enter(role: 'board' | 'resident' = 'board') {
  const request = new NextRequest('http://localhost:3000/api/v1/demo/demo-harbor/enter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  return POST(request, { params: Promise.resolve({ slug: 'demo-harbor' }) });
}

describe('POST /api/v1/demo/[slug]/enter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDemoInstanceForEntryMock.mockResolvedValue(INSTANCE);
    createDemoSessionMock.mockResolvedValue({ ok: true, cookies: [] });
    emitConversionEventMock.mockResolvedValue(undefined);
    fillDemoCommunitySiteMock.mockResolvedValue(undefined);
  });

  it("fills the demo's website with its suggested look before it signs the visitor in", async () => {
    const response = await enter('board');

    expect(response.status).toBe(303);
    expect(fillDemoCommunitySiteMock).toHaveBeenCalledTimes(1);
    expect(fillDemoCommunitySiteMock).toHaveBeenCalledWith(42);
    // The site is there before the visitor lands on it.
    expect(fillDemoCommunitySiteMock.mock.invocationCallOrder[0]).toBeLessThan(
      createDemoSessionMock.mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it('does not touch the site of a demo that has expired', async () => {
    getDemoInstanceForEntryMock.mockResolvedValue({ ...INSTANCE, demoExpiresAt: new Date('2000-01-01') });

    const response = await enter();

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toContain('/demo/demo-harbor');
    expect(fillDemoCommunitySiteMock).not.toHaveBeenCalled();
    expect(createDemoSessionMock).not.toHaveBeenCalled();
  });

  it('does not touch the site of a community that is not a demo', async () => {
    getDemoInstanceForEntryMock.mockResolvedValue({ ...INSTANCE, isDemo: false });

    const response = await enter();

    expect(response.status).toBe(404);
    expect(fillDemoCommunitySiteMock).not.toHaveBeenCalled();
  });

  it('does not touch a site when the demo was never set up', async () => {
    getDemoInstanceForEntryMock.mockResolvedValue({ ...INSTANCE, seededCommunityId: null });

    const response = await enter();

    expect(response.status).toBe(404);
    expect(fillDemoCommunitySiteMock).not.toHaveBeenCalled();
  });
});
