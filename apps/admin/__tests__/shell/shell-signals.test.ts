import { describe, expect, it, vi } from 'vitest';
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
import { captureException } from '@sentry/nextjs';
import { getShellSignals } from '@/lib/server/shell-signals';
import type { SignalProvider } from '@/lib/server/signals/types';

const ok = (key: SignalProvider['key'], count: number, critical?: { fingerprint: string }): SignalProvider => ({
  key,
  load: async () => ({
    count,
    items: [{ id: `${key}-1`, tone: 'info', icon: 'inbox', title: key, meta: 'm', href: `/${key}`, occurredAt: '2026-09-08T10:00:00Z' }],
    critical: critical ? { ...critical, text: 't', shortText: 's', href: `/${key}` } : null,
  }),
});

describe('getShellSignals', () => {
  it('composes counts and newest-first items from every provider', async () => {
    const s = await getShellSignals([ok('inbox', 7), ok('leads', 6)]);
    expect(s.counts.inbox).toBe(7);
    expect(s.counts.leads).toBe(6);
    expect(s.counts.tickets).toBe(0);
    expect(s.items.map((i) => i.id)).toEqual(['inbox-1', 'leads-1']);
    expect(s.failed).toEqual([]);
  });
  it('a throwing provider yields 0, is reported to Sentry and named in `failed`, and never blanks the rest', async () => {
    const boom: SignalProvider = { key: 'health', load: async () => { throw new Error('sentry down'); } };
    const s = await getShellSignals([ok('inbox', 2), boom]);
    expect(s.counts.inbox).toBe(2);
    expect(s.counts.health).toBe(0);
    expect(s.failed).toEqual(['health']);
    expect(captureException).toHaveBeenCalledTimes(1);
  });
  it('picks the first critical alert in provider order', async () => {
    const s = await getShellSignals([ok('billing', 1, { fingerprint: 'b' }), ok('health', 1, { fingerprint: 'h' })]);
    expect(s.critical?.fingerprint).toBe('b');
  });
});
