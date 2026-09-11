/**
 * `onboardingSignals` — the nav badge and the tray rows.
 *
 * `getPipeline` is mocked wholesale: its reads are the database's business and
 * its derivation is covered by `onboarding-derivation.test.ts`. What these cases
 * are about is the mapping from a pipeline to shell chrome — in particular that
 * the badge counts BLOCKED cards rather than pipeline size, which is the one
 * decision that makes the badge drivable to zero.
 */
import { describe, expect, it, vi } from 'vitest';

import type { Pipeline, PipelineCard, Stage } from '@/lib/server/onboarding';

const getPipeline = vi.fn<() => Promise<Pipeline>>();
vi.mock('@/lib/server/onboarding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/onboarding')>();
  return { ...actual, getPipeline: () => getPipeline() };
});

import { onboardingSignals } from '@/lib/server/signals/onboarding';

function card(over: Partial<PipelineCard> & { id: string; stage: Stage }): PipelineCard {
  return {
    name: 'A community',
    meta: 'meta',
    pct: 0,
    steps: '',
    blocker: null,
    next: 'Do the thing',
    href: '/clients/1',
    occurredAt: '2026-09-01T00:00:00Z',
    ...over,
  };
}

function pipeline(stages: Partial<Record<Stage, PipelineCard[]>>): Pipeline {
  return {
    stages: { lead: [], demo: [], trial: [], active: [], ...stages },
    checklist: null,
    generatedAt: '2026-09-08T00:00:00Z',
  };
}

describe('onboardingSignals', () => {
  it('counts blocked cards, not pipeline size', async () => {
    getPipeline.mockResolvedValue(
      pipeline({
        lead: [card({ id: 'lead-1', stage: 'lead' }), card({ id: 'lead-2', stage: 'lead' })],
        demo: [card({ id: 'demo-1', stage: 'demo', blocker: 'Demo stale in 3 days' })],
        trial: [card({ id: 'trial-1', stage: 'trial', blocker: 'Root manager not claimed' })],
        active: [card({ id: 'active-1', stage: 'active' })],
      }),
    );

    const result = await onboardingSignals.load();

    // Five cards on the board, two of them blocked.
    expect(result.count).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items.every((i) => i.tone === 'warning' && i.icon === 'building')).toBe(true);
  });

  it('is silent when nothing is blocked', async () => {
    getPipeline.mockResolvedValue(pipeline({ lead: [card({ id: 'lead-1', stage: 'lead' })] }));
    const result = await onboardingSignals.load();
    expect(result).toMatchObject({ count: 0, items: [], critical: null });
  });

  it('carries the card event time, not the read time', async () => {
    getPipeline.mockResolvedValue(
      pipeline({
        demo: [
          card({
            id: 'demo-9',
            stage: 'demo',
            blocker: 'Demo stale in 3 days',
            occurredAt: '2026-08-01T00:00:00Z',
            href: '/demo',
            name: 'Palmetto',
            next: 'Convert to trial or archive',
          }),
        ],
      }),
    );
    const [item] = (await onboardingSignals.load()).items;
    // `generatedAt` is 2026-09-08 — stamping that would float this row to the
    // top of a tray it shares with every other provider, forever.
    expect(item!.occurredAt).toBe('2026-08-01T00:00:00Z');
    expect(item!.title).toBe('Palmetto: Demo stale in 3 days');
    expect(item!.meta).toBe('Convert to trial or archive');
    expect(item!.href).toBe('/demo');
  });

  it('caps the tray at five rows while the badge keeps counting', async () => {
    getPipeline.mockResolvedValue(
      pipeline({
        trial: Array.from({ length: 9 }, (_, i) =>
          card({ id: `trial-${i}`, stage: 'trial', blocker: 'Root manager not claimed' }),
        ),
      }),
    );
    const result = await onboardingSignals.load();
    expect(result.count).toBe(9);
    expect(result.items).toHaveLength(5);
  });

  it('lets a failed read reject rather than reporting an empty pipeline', async () => {
    // A caught failure would render as "nothing needs attention", which is the
    // one claim a provider that could not read is in no position to make.
    getPipeline.mockRejectedValue(new Error('db is down'));
    await expect(onboardingSignals.load()).rejects.toThrow('db is down');
  });
});
