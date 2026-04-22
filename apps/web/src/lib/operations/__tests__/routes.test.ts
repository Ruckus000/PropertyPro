import { describe, expect, it, afterEach, vi } from 'vitest';
import {
  operationsHubHref,
  operationsTabHref,
  buildLegacyRedirectParams,
  KNOWN_OPERATIONS_HREFS,
  type OperationsTab,
} from '../routes';

describe('operationsTabHref', () => {
  it('builds canonical path with tab param', () => {
    expect(operationsTabHref(42, 'requests')).toBe('/communities/42/operations?tab=requests');
    expect(operationsTabHref(42, 'work-orders')).toBe('/communities/42/operations?tab=work-orders');
    expect(operationsTabHref(42, 'reservations')).toBe('/communities/42/operations?tab=reservations');
    expect(operationsTabHref(42, 'all')).toBe('/communities/42/operations?tab=all');
  });

  it('throws on non-positive integer communityId', () => {
    expect(() => operationsTabHref(0, 'requests')).toThrow();
    expect(() => operationsTabHref(-1, 'requests')).toThrow();
    expect(() => operationsTabHref(NaN, 'requests')).toThrow();
    expect(() => operationsTabHref(1.5, 'requests')).toThrow();
    expect(() => operationsTabHref(undefined as unknown as number, 'requests')).toThrow();
  });

  it('produces identical output for different cids (pure path shape)', () => {
    const a = operationsTabHref(1, 'requests').replace('/1/', '/X/');
    const b = operationsTabHref(999, 'requests').replace('/999/', '/X/');
    expect(a).toBe(b);
  });
});

describe('operationsHubHref', () => {
  it('defaults to no tab when omitted', () => {
    expect(operationsHubHref(42)).toBe('/communities/42/operations');
  });

  it('includes tab when provided', () => {
    expect(operationsHubHref(42, 'reservations')).toBe('/communities/42/operations?tab=reservations');
  });

  it('preserves from=maintenance extra', () => {
    expect(operationsHubHref(42, 'requests', { from: 'maintenance' })).toBe(
      '/communities/42/operations?tab=requests&from=maintenance'
    );
  });

  it('preserves scope extra', () => {
    expect(operationsHubHref(42, 'requests', { scope: 'mine' })).toBe(
      '/communities/42/operations?tab=requests&scope=mine'
    );
  });
});

describe('buildLegacyRedirectParams', () => {
  it('allowlists status, priority, unitId, q; drops everything else', () => {
    const result = buildLegacyRedirectParams({
      status: 'new',
      priority: 'urgent',
      unitId: '42',
      q: 'leak',
      communityId: '5',
      randomKey: 'ignored',
      tab: 'overridden-later',
    });
    expect(result.get('status')).toBe('new');
    expect(result.get('priority')).toBe('urgent');
    expect(result.get('unitId')).toBe('42');
    expect(result.get('q')).toBe('leak');
    expect(result.get('communityId')).toBeNull();
    expect(result.get('randomKey')).toBeNull();
    expect(result.get('tab')).toBeNull();
  });

  it('ignores non-string values', () => {
    const result = buildLegacyRedirectParams({
      status: ['a', 'b'],
      priority: undefined,
      unitId: '42',
    });
    expect(result.get('status')).toBeNull();
    expect(result.get('priority')).toBeNull();
    expect(result.get('unitId')).toBe('42');
  });

  it('skips empty-string values', () => {
    const result = buildLegacyRedirectParams({ status: '', priority: 'high' });
    expect(result.get('status')).toBeNull();
    expect(result.get('priority')).toBe('high');
  });
});

describe('KNOWN_OPERATIONS_HREFS', () => {
  it('exposes the canonical operations path shape for the CI guard', () => {
    expect(KNOWN_OPERATIONS_HREFS.size).toBeGreaterThan(0);
    for (const tab of ['all', 'requests', 'work-orders', 'reservations'] as OperationsTab[]) {
      expect(KNOWN_OPERATIONS_HREFS.has(operationsTabHref(1, tab))).toBe(true);
    }
    expect(KNOWN_OPERATIONS_HREFS.has(operationsHubHref(1))).toBe(true);
  });
});

describe('rollback flag', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('emits legacy hrefs when flag = v1', async () => {
    vi.stubEnv('OPERATIONS_HUB_ROUTING', 'v1');
    vi.resetModules();
    const mod = await import('../routes');
    expect(mod.operationsTabHref(42, 'requests')).toBe('/maintenance/submit?communityId=42');
  });
});
