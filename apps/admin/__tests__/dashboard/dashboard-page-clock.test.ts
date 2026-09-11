import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Pin the PROCESS zone, because this defect is invisible from Florida: with
 * `TZ=America/New_York` the buggy `now.getHours()` happens to give the right
 * answer, so a developer on an Eastern machine sees this file green either way.
 * That is how the bug shipped. Vercel runs UTC; so does this file.
 * (Node re-reads `process.env.TZ` on assignment, v16.2+. The first case asserts
 * it actually took effect rather than trusting it.)
 */
process.env.TZ = 'UTC';

/**
 * The greeting and date the dashboard PAGE hands down must be on the platform
 * clock, not the server's.
 *
 * `platform-clock.test.ts` proves the helpers; this proves the page uses them.
 * Without it, the page could go back to `now.getHours()` / an unzoned
 * `Intl.DateTimeFormat` with every helper case still green — which is how the
 * defect shipped.
 */
const requireAdminPageSessionMock = vi.fn(async () => ({
  id: 'admin-1',
  email: 'jon@getpropertypro.com',
  role: 'super_admin' as const,
}));

vi.mock('@/lib/request/admin-page-context', () => ({
  requireAdminPageSession: requireAdminPageSessionMock,
}));
vi.mock('@/lib/server/dashboard', () => ({
  getPlatformDashboardStats: vi.fn(async () => ({ overview: {}, billing: {}, compliance: {}, lifecycle: {}, deltas: {} })),
}));
vi.mock('@/lib/server/dashboard-series', () => ({
  getDashboardSeries: vi.fn(async () => ({})),
}));
vi.mock('@/lib/server/preferences', () => ({
  getPreferences: vi.fn(async () => ({
    notificationsReadAt: null,
    alertPrefs: { errorSpikes: true, paymentFailures: true, newSupportThreads: true, deletionReminders: true, newLeadsDigest: false, errorSpikeThreshold: 10 },
    pushSentFingerprints: [],
  })),
}));
vi.mock('@/lib/server/shell-signals', () => ({
  getShellSignals: vi.fn(async () => ({ items: [], generatedAt: '2026-09-10T00:00:00.000Z' })),
}));

const DashboardStub = (props: unknown) => props;
vi.mock('@/components/dashboard/PlatformDashboard', () => ({
  PlatformDashboard: DashboardStub,
}));
vi.mock('@propertypro/ui', () => ({
  PageBody: (props: unknown) => props,
}));

type Element = { type?: unknown; props?: Record<string, unknown> };

function findDashboardProps(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findDashboardProps(child);
      if (found) return found;
    }
    return null;
  }
  const element = node as Element;
  if (element.type === DashboardStub) return element.props ?? {};
  return element.props ? findDashboardProps(element.props.children) : null;
}

describe('DashboardPage greeting + date', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders an evening greeting and yesterday-in-UTC terms for 21:00 EDT', async () => {
    // 21:00 EDT on Thursday 10 September 2026. In UTC this instant is already
    // 01:00 on Friday the 11th, which is what the page used to report.
    vi.setSystemTime(new Date('2026-09-11T01:00:00Z'));

    // The TZ pin above took effect — otherwise a server-local computation would
    // agree with the platform clock and this case would prove nothing.
    expect(new Date().getHours(), 'process TZ is not UTC; see the note at the top').toBe(1);

    const { default: DashboardPage } = await import('@/app/(console)/dashboard/page');
    const props = findDashboardProps(await DashboardPage());
    // Anti-vacuity: a page that stopped rendering PlatformDashboard would make
    // both assertions below pass by reading undefined.
    expect(props, 'the page did not render PlatformDashboard').not.toBeNull();

    expect(props!.greeting).toBe('Good evening');
    expect(props!.today).toBe('Thursday, September 10');
  });
});
