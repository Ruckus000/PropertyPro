import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '@propertypro/shared/http';
const requirePlatformAdmin = vi.fn();
vi.mock('@/lib/auth/platform-admin', () => ({ requirePlatformAdmin: () => requirePlatformAdmin() }));
// The route now resolves the polling operator's own error-spike threshold
// before composing the signals, so this read has to be stubbed too — it would
// otherwise reach the real service-role client.
vi.mock('@/lib/server/preferences', () => ({
  getPreferences: async () => ({
    notificationsReadAt: null,
    alertPrefs: { errorSpikes: true, paymentFailures: true, newSupportThreads: true, deletionReminders: true, newLeadsDigest: false, errorSpikeThreshold: 10 },
    pushSentFingerprints: [],
  }),
}));
vi.mock('@/lib/server/shell-signals', () => ({
  getShellSignals: async () => ({ counts: { inbox: 1, tickets: 0, health: 0, onboarding: 0, billing: 0, leads: 0, deletion: 0 }, items: [], critical: null, generatedAt: 'x', failed: [] }),
}));
import { GET } from '@/app/api/admin/shell/signals/route';

describe('GET /api/admin/shell/signals', () => {
  it('401s an anonymous caller before touching data', async () => {
    requirePlatformAdmin.mockRejectedValueOnce(new UnauthorizedError());
    const res = await GET(new NextRequest('http://admin.test/api/admin/shell/signals'));
    expect(res.status).toBe(401);
  });
  it('returns the signals with no-store caching', async () => {
    requirePlatformAdmin.mockResolvedValueOnce({ id: 'u', email: 'e', role: 'super_admin' });
    const res = await GET(new NextRequest('http://admin.test/api/admin/shell/signals'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect((await res.json()).data.counts.inbox).toBe(1);
  });
});
