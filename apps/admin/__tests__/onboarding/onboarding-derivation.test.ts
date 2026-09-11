/**
 * The onboarding pipeline's pure derivation (spec D21).
 *
 * Everything asserted here is a function of already-fetched rows and an
 * injected `now`, which is the reason `deriveStages` takes both rather than
 * reading the clock or the database: a stage boundary that depends on today's
 * date is exactly the kind of rule that cannot be tested through a query.
 */
import { describe, expect, it } from 'vitest';

import { deriveStages, humanizeItemKey } from '@/lib/server/onboarding';
import {
  STALE_DEMO_ORANGE_THRESHOLD_DAYS,
  STALE_DEMO_RED_THRESHOLD_DAYS,
} from '@/lib/utils/stale-badge';

const now = new Date('2026-09-08T00:00:00Z');

/** A trial row with the two blockers cleared, so each case perturbs one thing. */
function trial(over: Partial<Parameters<typeof deriveStages>[0]['trials'][number]> = {}) {
  return {
    id: 3,
    name: 'Pelican Bay',
    created_at: '2026-08-28T00:00:00Z',
    subscription_current_period_end_at: null,
    hasRoot: true,
    checklist: [
      { item_key: 'root_claimed', completed_at: 'x' },
      { item_key: 'owner_roster_imported', completed_at: null },
    ],
    ...over,
  };
}

describe('onboarding derivation', () => {
  it('humanizes checklist keys', () => {
    expect(humanizeItemKey('owner_roster_imported')).toBe('Owner roster imported');
  });

  it('places rows in stages with progress and blockers', () => {
    const stages = deriveStages(
      {
        leads: [
          {
            id: 1,
            association_name: 'Oceanview',
            unit_count: 86,
            source: 'compliance_checker',
            status: 'new',
            created_at: '2026-09-07T00:00:00Z',
          },
        ],
        demos: [
          {
            id: 2,
            prospect_name: 'Palmetto Ridge',
            created_at: '2026-08-15T00:00:00Z',
            is_converted: false,
          },
        ],
        trials: [
          trial({
            subscription_current_period_end_at: '2026-09-12T00:00:00Z',
            hasRoot: false,
          }),
        ],
        active: [{ id: 4, name: 'Harbor Lights', created_at: '2026-08-20T00:00:00Z' }],
      },
      now,
    );

    expect(stages.lead[0]).toMatchObject({ name: 'Oceanview', next: 'Reply & offer a demo' });
    expect(stages.demo[0]!.blocker).toMatch(/stale in 6 days/);
    expect(stages.trial[0]).toMatchObject({ pct: 50, steps: '1/2', next: 'Owner roster imported' });
    expect(stages.trial[0]!.blocker).toBe('Root manager not claimed');
    expect(stages.active[0]!.next).toBe('30-day check-in call');
  });

  // ── Leads ────────────────────────────────────────────────────────────────

  it('gives each lead status its own next action and a filtered href', () => {
    const base = {
      association_name: 'A',
      unit_count: 40,
      source: 'compliance_checker',
      created_at: '2026-09-07T00:00:00Z',
    };
    const stages = deriveStages(
      {
        leads: [
          { ...base, id: 1, status: 'new' },
          { ...base, id: 2, status: 'contacted' },
          { ...base, id: 3, status: 'qualified' },
        ],
        demos: [],
        trials: [],
        active: [],
      },
      now,
    );
    expect(stages.lead.map((c) => c.next)).toEqual([
      'Reply & offer a demo',
      'Follow up',
      'Create demo',
    ]);
    expect(stages.lead.map((c) => c.href)).toEqual([
      '/leads?status=new',
      '/leads?status=contacted',
      '/leads?status=qualified',
    ]);
  });

  it('says so rather than inventing a unit count when the lead has none', () => {
    const stages = deriveStages(
      {
        leads: [
          {
            id: 1,
            association_name: null,
            unit_count: null,
            source: 'pm_inquiry',
            status: 'new',
            created_at: '2026-09-07T00:00:00Z',
          },
        ],
        demos: [],
        trials: [],
        active: [],
      },
      now,
    );
    expect(stages.lead[0]!.name).toBe('Unnamed association');
    expect(stages.lead[0]!.meta).toBe('Unit count unknown · Portfolio inquiry');
  });

  // ── Demos ────────────────────────────────────────────────────────────────

  it('reads the stale-demo countdown off the shared thresholds, not a literal', () => {
    const dayMs = 86_400_000;
    const at = (age: number) => new Date(now.getTime() - age * dayMs).toISOString();
    const demo = (id: number, age: number) => ({
      id,
      prospect_name: `D${id}`,
      created_at: at(age),
      is_converted: false,
    });

    const stages = deriveStages(
      {
        leads: [],
        demos: [
          demo(1, STALE_DEMO_ORANGE_THRESHOLD_DAYS - 1),
          demo(2, STALE_DEMO_ORANGE_THRESHOLD_DAYS),
          demo(3, STALE_DEMO_RED_THRESHOLD_DAYS - 1),
          demo(4, STALE_DEMO_RED_THRESHOLD_DAYS + 5),
        ],
        trials: [],
        active: [],
      },
      now,
    );
    const byId = new Map(stages.demo.map((c) => [c.id, c]));

    // One day below the orange threshold: not a blocker yet.
    expect(byId.get('demo-1')!.blocker).toBeNull();
    // At the threshold: the countdown is the gap between the two constants.
    const gap = STALE_DEMO_RED_THRESHOLD_DAYS - STALE_DEMO_ORANGE_THRESHOLD_DAYS;
    expect(byId.get('demo-2')!.blocker).toBe(`Demo stale in ${gap} days`);
    // One day short of red: singular, because "1 days" is how a derived string
    // announces that nobody read it.
    expect(byId.get('demo-3')!.blocker).toBe('Demo stale in 1 day');
    // Past red: no countdown left to run, so it states the age instead of
    // rendering a negative number of days.
    expect(byId.get('demo-4')!.blocker).toBe(
      `Demo is stale — ${STALE_DEMO_RED_THRESHOLD_DAYS + 5} days old`,
    );
  });

  it('drops converted demos', () => {
    const stages = deriveStages(
      {
        leads: [],
        demos: [
          { id: 1, prospect_name: 'Converted', created_at: '2026-08-15T00:00:00Z', is_converted: true },
          { id: 2, prospect_name: 'Open', created_at: '2026-08-15T00:00:00Z', is_converted: false },
        ],
        trials: [],
        active: [],
      },
      now,
    );
    expect(stages.demo.map((c) => c.name)).toEqual(['Open']);
  });

  // ── Trials ───────────────────────────────────────────────────────────────

  it('counts one checklist item per key, not one per member who was given it', () => {
    // `onboarding_checklist_items` is UNIQUE on (community_id, user_id,
    // item_key), so a five-member community holds five rows per key. Counting
    // rows would report "2/10" for a community with two setup steps.
    const stages = deriveStages(
      {
        leads: [],
        demos: [],
        trials: [
          trial({
            checklist: [
              { item_key: 'add_units', completed_at: null },
              { item_key: 'add_units', completed_at: '2026-09-01T00:00:00Z' },
              { item_key: 'post_announcement', completed_at: null },
              { item_key: 'post_announcement', completed_at: null },
            ],
          }),
        ],
        active: [],
      },
      now,
    );
    // Two distinct keys; `add_units` is done because SOMEBODY did it.
    expect(stages.trial[0]).toMatchObject({ steps: '1/2', pct: 50, next: 'Post announcement' });
  });

  it('offers the payment link once every step is done', () => {
    const stages = deriveStages(
      {
        leads: [],
        demos: [],
        trials: [trial({ checklist: [{ item_key: 'add_units', completed_at: 'x' }] })],
        active: [],
      },
      now,
    );
    expect(stages.trial[0]).toMatchObject({ pct: 100, steps: '1/1', next: 'Send payment link' });
  });

  it('does not claim a trial with no checklist rows is finished', () => {
    // 0/0 is vacuously "all done", and calling it that would put "Send payment
    // link" on a community that has not started setting up.
    const stages = deriveStages(
      { leads: [], demos: [], trials: [trial({ checklist: [] })], active: [] },
      now,
    );
    expect(stages.trial[0]).toMatchObject({ pct: 0, steps: '0/0', next: 'Checklist not started' });
  });

  it('prefers the unclaimed root over the trial countdown when both apply', () => {
    const stages = deriveStages(
      {
        leads: [],
        demos: [],
        trials: [
          trial({ hasRoot: false, subscription_current_period_end_at: '2026-09-10T00:00:00Z' }),
        ],
        active: [],
      },
      now,
    );
    expect(stages.trial[0]!.blocker).toBe('Root manager not claimed');
  });

  it('counts down the trial only inside the seven-day window', () => {
    const cases: [string, string | null][] = [
      ['2026-09-20T00:00:00Z', null],
      ['2026-09-12T00:00:00Z', 'Trial ends in 4 days'],
      ['2026-09-09T00:00:00Z', 'Trial ends in 1 day'],
      ['2026-09-08T00:00:00Z', 'Trial ends today'],
      ['2026-09-05T00:00:00Z', 'Trial has ended'],
    ];
    for (const [endsAt, expected] of cases) {
      const stages = deriveStages(
        {
          leads: [],
          demos: [],
          trials: [trial({ subscription_current_period_end_at: endsAt })],
          active: [],
        },
        now,
      );
      expect(stages.trial[0]!.blocker, `for ${endsAt}`).toBe(expected);
    }
  });

  it('links a trial at its workspace', () => {
    const stages = deriveStages(
      { leads: [], demos: [], trials: [trial({ id: 77 })], active: [] },
      now,
    );
    expect(stages.trial[0]!.href).toBe('/clients/77');
  });

  // ── Ordering ─────────────────────────────────────────────────────────────

  it('puts blocked cards first, then whoever has waited longest', () => {
    const stages = deriveStages(
      {
        leads: [],
        demos: [],
        trials: [
          trial({ id: 1, name: 'Newest unblocked', created_at: '2026-09-06T00:00:00Z' }),
          trial({ id: 2, name: 'Oldest unblocked', created_at: '2026-08-01T00:00:00Z' }),
          trial({ id: 3, name: 'Blocked', created_at: '2026-09-07T00:00:00Z', hasRoot: false }),
        ],
        active: [],
      },
      now,
    );
    expect(stages.trial.map((c) => c.name)).toEqual([
      'Blocked',
      'Oldest unblocked',
      'Newest unblocked',
    ]);
  });
});
