/**
 * `lib/server/push.ts` — the two pure functions and the dispatch loop.
 *
 * Nothing here reaches a database, a push service or the network: every
 * dependency of `dispatchPush` is injected, which is why it takes a `deps` bag
 * at all.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  candidatesFromSignals,
  dispatchPush,
  selectUnsent,
  PUSH_FINGERPRINT_LIMIT,
  type PushCandidate,
  type PushSubscriptionRecord,
} from '@/lib/server/push';
import { DEFAULT_ALERT_PREFS } from '@/lib/preferences/alert-prefs';
import type { ShellSignals } from '@/lib/server/shell-signals';

const signals: ShellSignals = {
  counts: { inbox: 1, tickets: 0, health: 0, onboarding: 0, billing: 1, leads: 0, deletion: 0 },
  items: [
    {
      key: 'inbox',
      id: 'thread-1',
      tone: 'info',
      icon: 'inbox',
      title: 'New reply from Denise',
      meta: 'support@',
      href: '/inbox/1',
      occurredAt: '2026-09-08T09:14:00Z',
    },
    {
      key: 'billing',
      id: 'billing-1',
      tone: 'warning',
      icon: 'creditCard',
      title: 'Bayview is 19 days past due',
      meta: '$240',
      href: '/clients/1?tab=billing',
      occurredAt: '2026-09-08T08:00:00Z',
    },
  ],
  critical: {
    fingerprint: 'errors:PP-1',
    text: 'Stripe webhook failing',
    shortText: 's',
    href: '/health',
  },
  generatedAt: 'x',
  failed: [],
};

function candidate(fingerprint: string): PushCandidate {
  return { fingerprint, title: 't', body: 'b', url: '/', prefKey: 'errorSpikes' };
}

describe('candidatesFromSignals', () => {
  it('maps signals to candidates gated by prefs', () => {
    const c = candidatesFromSignals(signals, DEFAULT_ALERT_PREFS);
    expect(c.map((x) => x.fingerprint)).toEqual(['errors:PP-1', 'thread-1', 'billing-1']);
    expect(
      candidatesFromSignals(signals, {
        ...DEFAULT_ALERT_PREFS,
        newSupportThreads: false,
      }).some((x) => x.fingerprint === 'thread-1'),
    ).toBe(false);
  });

  it('drops the critical banner when errorSpikes is off', () => {
    const c = candidatesFromSignals(signals, { ...DEFAULT_ALERT_PREFS, errorSpikes: false });
    expect(c.map((x) => x.fingerprint)).toEqual(['thread-1', 'billing-1']);
  });

  it('carries the item href so the notification click lands on the thing', () => {
    const c = candidatesFromSignals(signals, DEFAULT_ALERT_PREFS);
    expect(c.find((x) => x.fingerprint === 'billing-1')?.url).toBe('/clients/1?tab=billing');
  });

  it('emits ONE leads digest, only in the 08 hour, fingerprinted on the day', () => {
    const withLeads: ShellSignals = {
      ...signals,
      counts: { ...signals.counts, leads: 3 },
    };
    const prefs = { ...DEFAULT_ALERT_PREFS, newLeadsDigest: true };

    // Local time — the digest hour is the deployment's, and so is the stamp.
    const atEight = new Date(2026, 8, 8, 8, 30);
    const atNine = new Date(2026, 8, 8, 9, 30);

    const eight = candidatesFromSignals(withLeads, prefs, atEight);
    expect(eight.filter((c) => c.prefKey === 'newLeadsDigest')).toHaveLength(1);
    expect(eight.at(-1)?.fingerprint).toBe('leads:digest:2026-09-08');
    expect(eight.at(-1)?.body).toBe('3 new leads since yesterday');

    expect(candidatesFromSignals(withLeads, prefs, atNine).some(
      (c) => c.prefKey === 'newLeadsDigest',
    )).toBe(false);
  });

  it('does not push signals that have no opt-in to turn them off', () => {
    const withTicket: ShellSignals = {
      ...signals,
      items: [
        ...signals.items,
        {
          key: 'tickets',
          id: 'ticket-9',
          tone: 'warning',
          icon: 'ticket',
          title: 'Ticket 9 breached',
          meta: '',
          href: '/tickets/9',
          occurredAt: '2026-09-08T07:00:00Z',
        },
      ],
    };
    expect(
      candidatesFromSignals(withTicket, DEFAULT_ALERT_PREFS).some((c) => c.fingerprint === 'ticket-9'),
    ).toBe(false);
  });
});

describe('selectUnsent', () => {
  it('never sends the same fingerprint twice and bounds the ledger', () => {
    const { send, nextSent } = selectUnsent(
      [candidate('a')],
      ['a', ...Array.from({ length: 250 }, (_, i) => `old-${i}`)],
    );
    expect(send).toEqual([]);
    expect(nextSent).toHaveLength(200);
    expect(nextSent).toHaveLength(PUSH_FINGERPRINT_LIMIT);
  });

  it('keeps the NEWEST entries when it trims, not the oldest', () => {
    const sent = Array.from({ length: PUSH_FINGERPRINT_LIMIT }, (_, i) => `old-${i}`);
    const { send, nextSent } = selectUnsent([candidate('fresh')], sent);
    expect(send.map((c) => c.fingerprint)).toEqual(['fresh']);
    expect(nextSent).toHaveLength(PUSH_FINGERPRINT_LIMIT);
    expect(nextSent.at(-1)).toBe('fresh');
    // The oldest entry is the one discarded.
    expect(nextSent).not.toContain('old-0');
  });

  it('collapses a duplicate inside one batch', () => {
    const { send, nextSent } = selectUnsent([candidate('dup'), candidate('dup')], []);
    expect(send).toHaveLength(1);
    expect(nextSent).toEqual(['dup']);
  });
});

describe('dispatchPush', () => {
  const subscriptions: PushSubscriptionRecord[] = [
    { id: 1, endpoint: 'https://p/ok', p256dh: 'x', auth: 'y' },
    { id: 2, endpoint: 'https://p/gone', p256dh: 'x', auth: 'y' },
  ];

  it('prunes gone subscriptions and persists the sent ledger', async () => {
    const send = vi.fn(async (sub: PushSubscriptionRecord) => {
      if (sub.endpoint.includes('gone')) {
        throw Object.assign(new Error('gone'), { statusCode: 410 });
      }
    });
    const deleted: string[] = [];
    const persisted: string[][] = [];

    const result = await dispatchPush({
      listAdmins: async () => [{ userId: 'u1' }],
      getPreferences: async () => ({
        notificationsReadAt: null,
        alertPrefs: DEFAULT_ALERT_PREFS,
        pushSentFingerprints: [],
      }),
      getSignals: async () => signals,
      listSubscriptions: async () => subscriptions,
      sendNotification: send,
      deleteSubscription: async (id) => {
        deleted.push(String(id));
      },
      recordFailure: async () => {},
      persistSent: async (_u, fps) => {
        persisted.push(fps);
      },
      now: () => new Date('2026-09-08T09:30:00Z'),
    });

    // `failed: 1`, not 3: a 410 means the browser threw the subscription away,
    // so the endpoint is skipped for the rest of the batch rather than being
    // POSTed to once per candidate. (The plan sketched 3 — that is 2 extra
    // outbound requests per tick for an identical outcome.)
    expect(result).toEqual({ configured: true, admins: 1, sent: 3, failed: 1, pruned: 1 });
    expect(deleted).toEqual(['2']);
    expect(persisted[0]).toEqual(['errors:PP-1', 'thread-1', 'billing-1']);
  });

  it('sends the SW payload shape, and only for unsent fingerprints', async () => {
    const payloads: string[] = [];
    const result = await dispatchPush({
      listAdmins: async () => [{ userId: 'u1' }],
      getPreferences: async () => ({
        notificationsReadAt: null,
        alertPrefs: DEFAULT_ALERT_PREFS,
        // Two of the three already told.
        pushSentFingerprints: ['errors:PP-1', 'thread-1'],
      }),
      getSignals: async () => signals,
      listSubscriptions: async () => [subscriptions[0]!],
      sendNotification: async (_sub, payload) => {
        payloads.push(payload);
      },
      persistSent: async () => {},
      now: () => new Date('2026-09-08T09:30:00Z'),
    });

    expect(result).toEqual({ configured: true, admins: 1, sent: 1, failed: 0, pruned: 0 });
    expect(payloads).toHaveLength(1);
    expect(JSON.parse(payloads[0]!)).toEqual({
      title: 'Payment problem',
      body: 'Bayview is 19 days past due — $240',
      url: '/clients/1?tab=billing',
    });
  });

  it('does not mark anything sent when the operator has no device', async () => {
    const persistSent = vi.fn(async () => {});
    const result = await dispatchPush({
      listAdmins: async () => [{ userId: 'u1' }],
      getPreferences: async () => ({
        notificationsReadAt: null,
        alertPrefs: DEFAULT_ALERT_PREFS,
        pushSentFingerprints: [],
      }),
      getSignals: async () => signals,
      listSubscriptions: async () => [],
      sendNotification: async () => {},
      persistSent,
      now: () => new Date('2026-09-08T09:30:00Z'),
    });

    expect(result).toEqual({ configured: true, admins: 1, sent: 0, failed: 0, pruned: 0 });
    expect(persistSent).not.toHaveBeenCalled();
  });

  it('does not mark anything sent when every device turned out to be gone', async () => {
    const persistSent = vi.fn(async () => {});
    const result = await dispatchPush({
      listAdmins: async () => [{ userId: 'u1' }],
      getPreferences: async () => ({
        notificationsReadAt: null,
        alertPrefs: DEFAULT_ALERT_PREFS,
        pushSentFingerprints: [],
      }),
      getSignals: async () => signals,
      listSubscriptions: async () => [subscriptions[1]!],
      sendNotification: async () => {
        throw Object.assign(new Error('gone'), { statusCode: 410 });
      },
      deleteSubscription: async () => {},
      persistSent,
      now: () => new Date('2026-09-08T09:30:00Z'),
    });

    expect(result).toEqual({ configured: true, admins: 1, sent: 0, failed: 1, pruned: 1 });
    expect(persistSent).not.toHaveBeenCalled();
  });

  it('counts a non-gone failure and keeps going for the next operator', async () => {
    const recordFailure = vi.fn(async () => {});
    const seen: string[] = [];
    const result = await dispatchPush({
      listAdmins: async () => [{ userId: 'u1' }, { userId: 'u2' }],
      getPreferences: async (userId) => {
        seen.push(userId);
        if (userId === 'u1') throw new Error('preferences read exploded');
        return {
          notificationsReadAt: null,
          alertPrefs: DEFAULT_ALERT_PREFS,
          pushSentFingerprints: ['errors:PP-1', 'thread-1', 'billing-1'],
        };
      },
      getSignals: async () => signals,
      listSubscriptions: async () => [subscriptions[0]!],
      sendNotification: async () => {
        throw Object.assign(new Error('boom'), { statusCode: 500 });
      },
      recordFailure,
      persistSent: async () => {},
      now: () => new Date('2026-09-08T09:30:00Z'),
    });

    // u1 threw and was swallowed; u2 still ran (and had nothing new to send).
    expect(seen).toEqual(['u1', 'u2']);
    expect(result).toEqual({ configured: true, admins: 2, sent: 0, failed: 0, pruned: 0 });
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it('reports NOT CONFIGURED and touches nothing when VAPID keys are unset', async () => {
    const previousPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const previousPrivate = process.env.VAPID_PRIVATE_KEY;
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    const listAdmins = vi.fn(async () => [{ userId: 'u1' }]);
    try {
      // No `sendNotification` injected — so the real VAPID check is what decides.
      const result = await dispatchPush({ listAdmins });
      expect(result).toEqual({ configured: false, admins: 0, sent: 0, failed: 0, pruned: 0 });
      expect(listAdmins).not.toHaveBeenCalled();
    } finally {
      if (previousPublic !== undefined) process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = previousPublic;
      if (previousPrivate !== undefined) process.env.VAPID_PRIVATE_KEY = previousPrivate;
    }
  });
});
