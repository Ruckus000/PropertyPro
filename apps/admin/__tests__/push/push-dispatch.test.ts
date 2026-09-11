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

  /**
   * Review H2 / security MEDIUM-1. A push body is rendered by the OS on a lock
   * screen and kept in a notification history we do not control, so it must
   * carry nothing a correspondent authored and no address.
   */
  describe('what a push body is allowed to carry', () => {
    const withUnknownSender: ShellSignals = {
      ...signals,
      items: [
        {
          ...signals.items[0]!,
          // The `participant_name ?? participant_email` fallback, and a subject
          // line chosen by whoever wrote to support@.
          title: 'New reply from denise.okafor@example.com',
          meta: 'Re: my unit is flooding · Support',
        },
      ],
    };

    it('carries neither the correspondent nor the subject for an inbox thread', () => {
      const [thread] = candidatesFromSignals(withUnknownSender, {
        ...DEFAULT_ALERT_PREFS,
        errorSpikes: false,
      });

      expect(thread?.body).not.toContain('@example.com');
      expect(thread?.body).not.toContain('my unit is flooding');
      expect(thread?.body).toBe(
        'Someone has written to a support mailbox. Open the console to read it.',
      );
      // The pointer still has to point somewhere.
      expect(thread?.url).toBe('/inbox/1');
    });

    // `critical.text` embeds `cron_runs.last_error` (withheld even from web's
    // unauthenticated cron-health probe) and the top Sentry issue's title.
    it('uses the critical banner’s shortText, never its long form', () => {
      const withCronFailure: ShellSignals = {
        ...signals,
        critical: {
          fingerprint: 'cron:expire-demos',
          text: 'expire-demos has failed 4 in a row — duplicate key value violates unique constraint "users_email_key" (user=ops@acme.test)',
          shortText: 'expire-demos failing',
          href: '/health',
        },
      };

      const [critical] = candidatesFromSignals(withCronFailure, DEFAULT_ALERT_PREFS);
      expect(critical?.body).toBe('expire-demos failing');
      expect(critical?.body).not.toContain('users_email_key');
      expect(critical?.body).not.toContain('@acme.test');
    });

    // The other two signals ARE allowed their tray text: a community name, a day
    // count and an MRR figure are all computed here, by us.
    it('still names the client on a payment problem', () => {
      const billing = candidatesFromSignals(signals, DEFAULT_ALERT_PREFS).find(
        (c) => c.fingerprint === 'billing-1',
      );
      expect(billing?.body).toBe('Bayview is 19 days past due — $240');
    });
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
      // The worker's `tag`. NOT the url — three alerts can share a destination
      // (`/deletion-requests`, `/billing`), and tagging on it collapsed them.
      fingerprint: 'billing-1',
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

  /**
   * Review M4. This case used to give `u2` a ledger holding EVERY candidate, so
   * `selectUnsent` returned nothing, `dispatchPush` hit the `send.length === 0`
   * short-circuit and `sendNotification` was never called — the test measured
   * the already-sent path while claiming the failure path, leaving
   * `recordFailure` and the Sentry capture at zero coverage. `u2`'s ledger now
   * leaves `billing-1` unsent, so the send really happens and really fails.
   */
  it('counts a non-gone failure and keeps going for the next operator', async () => {
    const recordFailure = vi.fn(async (_id: number) => {});
    const seen: string[] = [];
    const sendNotification = vi.fn(async () => {
      throw Object.assign(new Error('boom'), { statusCode: 500 });
    });
    const result = await dispatchPush({
      listAdmins: async () => [{ userId: 'u1' }, { userId: 'u2' }],
      getPreferences: async (userId) => {
        seen.push(userId);
        if (userId === 'u1') throw new Error('preferences read exploded');
        return {
          notificationsReadAt: null,
          alertPrefs: DEFAULT_ALERT_PREFS,
          // Two of three already told — `billing-1` is left to be sent.
          pushSentFingerprints: ['errors:PP-1', 'thread-1'],
        };
      },
      getSignals: async () => signals,
      listSubscriptions: async () => [subscriptions[0]!],
      sendNotification,
      recordFailure,
      persistSent: async () => {},
      now: () => new Date('2026-09-08T09:30:00Z'),
    });

    // u1 threw and was swallowed; u2 still ran, and actually attempted a send.
    expect(seen).toEqual(['u1', 'u2']);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ configured: true, admins: 2, sent: 0, failed: 1, pruned: 0 });
    // A non-gone failure is COUNTED against the subscription, not pruned.
    expect(recordFailure).toHaveBeenCalledWith(1);
  });

  /**
   * Review H1. The guard here used to be `deliveredHere === 0 && gone.size ===
   * subscriptions.length` — all-GONE rather than all-FAILED — so a push service
   * returning 500s left `gone` empty, the batch was written to the ledger, and
   * `selectUnsent` suppressed those alerts forever. An alert that reached nobody
   * must not be recorded as delivered.
   */
  it('does not mark anything sent when every send failed for a NON-gone reason', async () => {
    const persistSent = vi.fn(async () => {});
    const result = await dispatchPush({
      listAdmins: async () => [{ userId: 'u1' }],
      getPreferences: async () => ({
        notificationsReadAt: null,
        alertPrefs: DEFAULT_ALERT_PREFS,
        pushSentFingerprints: [],
      }),
      getSignals: async () => signals,
      listSubscriptions: async () => [subscriptions[0]!],
      // A push service having a bad five minutes: 500, not 410.
      sendNotification: async () => {
        throw Object.assign(new Error('service unavailable'), { statusCode: 500 });
      },
      recordFailure: async () => {},
      persistSent,
      now: () => new Date('2026-09-08T09:30:00Z'),
    });

    // All three candidates attempted against the one device, all three failed,
    // and NOTHING was pruned — which is exactly why the old all-gone condition
    // did not fire.
    expect(result).toEqual({ configured: true, admins: 1, sent: 0, failed: 3, pruned: 0 });
    expect(persistSent).not.toHaveBeenCalled();
  });

  // The converse, so the fix cannot be "never write the ledger": one device out
  // of two succeeding IS delivery, and is the reason the ledger is written per
  // batch rather than per send.
  it('DOES mark the batch sent when a single device took it', async () => {
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
      sendNotification: async (sub) => {
        if (sub.endpoint.includes('gone')) {
          throw Object.assign(new Error('boom'), { statusCode: 500 });
        }
      },
      deleteSubscription: async () => {},
      recordFailure: async () => {},
      persistSent: async (_u, fps) => {
        persisted.push(fps);
      },
      now: () => new Date('2026-09-08T09:30:00Z'),
    });

    expect(result).toEqual({ configured: true, admins: 1, sent: 3, failed: 3, pruned: 0 });
    expect(persisted[0]).toEqual(['errors:PP-1', 'thread-1', 'billing-1']);
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
