/**
 * Web Push for the operator console: which signals become a notification, which
 * have already been sent, and the dispatch loop the 15-minute cron drives.
 *
 * The console's signals are DERIVED per request — there is no row to mark
 * "notified" — so the only thing that stops the same stalled sync being pushed
 * every fifteen minutes is a per-operator ledger of fingerprints already sent.
 * That ledger lives in `platform_admin_preferences.push_sent_fingerprints` and
 * is bounded here, not by the database.
 *
 * ## Shape: two pure functions and one loop
 *
 * `candidatesFromSignals` and `selectUnsent` are pure and are where every
 * decision lives — what is worth a push, what the operator opted into, what has
 * already been sent, and how much history is kept. `dispatchPush` is the I/O:
 * it takes every dependency as an injectable, so its own tests neither reach a
 * database nor send a real notification.
 *
 * ## Unconfigured is a first-class state, not an error
 *
 * VAPID keys are generated per deployment and are absent on a fresh checkout
 * and in CI. Every path here must behave sanely without them: `dispatchPush`
 * returns `configured: false` and does nothing rather than throwing, so the
 * cron gets a 200 and Vercel does not retry it forever (a non-2xx from a cron
 * route retries indefinitely — see the Stripe-webhook precedent). The subscribe
 * UI refuses up front for the same reason: a subscription minted against a
 * public key the server cannot sign for would look successful and deliver
 * nothing.
 *
 * @module lib/server/push
 */
import * as Sentry from '@sentry/nextjs';

import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import type { PlatformAdminPushSubscriptionRow } from '@propertypro/db/supabase/admin-types';

import type { AdminPreferences, AlertPrefKey, AlertPrefs } from '@/lib/preferences/alert-prefs';
import { getPreferences } from '@/lib/server/preferences';
import { getShellSignals, type ShellSignals } from '@/lib/server/shell-signals';
import type { ShellSignalItem } from '@/lib/server/signals/types';

/** One notification we would send, before the already-sent ledger is consulted. */
export interface PushCandidate {
  /**
   * Stable identity of the THING being reported, not of this attempt — the
   * ledger is keyed on it, so a fingerprint that varies per tick would push on
   * every tick. Critical alerts reuse `ShellCritical.fingerprint`; tray rows use
   * the signal item's own id; the leads digest uses the calendar day.
   */
  fingerprint: string;
  title: string;
  body: string;
  url: string;
  /** The opt-in this candidate is gated behind. */
  prefKey: AlertPrefKey;
}

/**
 * How many fingerprints are kept per operator.
 *
 * This bound is the ONLY thing stopping a jsonb column growing without limit:
 * the column has a `jsonb_typeof(...) = 'array'` CHECK and nothing else, the
 * cron appends to it every fifteen minutes forever, and every append rewrites
 * the whole document. 200 is comfortably more than a tick can produce (the tray
 * holds at most 12 items plus one critical), so it only ever discards history
 * old enough that re-notifying would be the right answer anyway.
 */
export const PUSH_FINGERPRINT_LIMIT = 200;

/** The hour, in the deployment's local time (UTC on Vercel), the leads digest fires. */
export const LEADS_DIGEST_HOUR = 8;

function bodyFor(title: string, meta: string): string {
  return meta ? `${title} — ${meta}` : title;
}

/** A tray row's own words, for signals whose text is entirely platform-derived. */
function trayText(item: ShellSignalItem): string {
  return bodyFor(item.title, item.meta);
}

/**
 * Which nav signal maps to which opt-in, what its notification is called, and
 * how its BODY is built.
 *
 * `tickets`, `onboarding` and `health` items are deliberately absent: the five
 * opt-ins on the settings screen are the whole vocabulary, and a signal with no
 * opt-in must not push — there would be no way for an operator to turn it off.
 * Health is covered by `critical` below rather than per item.
 *
 * ## The body is decided HERE, per signal, and is never inherited
 *
 * A tray row is read inside an authenticated console by the operator who opened
 * it. A push body is rendered by the OS on a lock screen, in front of whoever is
 * near the device, and kept in a notification history we do not control. The two
 * are not interchangeable, so `body` is an explicit field per signal rather than
 * an automatic pass-through of the tray's `title`/`meta`.
 *
 * A signal may use `trayText` ONLY if every part of that text is
 * platform-derived. `inbox` cannot, on both counts (review H2 / security
 * MEDIUM-1):
 *
 * - its `title` falls back to the correspondent's EMAIL ADDRESS whenever we have
 *   no name for them — the ordinary case for a first contact, and the one field
 *   that identifies a person outside our system;
 * - its `meta` is the email's SUBJECT, free text chosen by whoever wrote to
 *   `support@`. That is anyone on the internet picking a string to render under
 *   our icon, on the lock screen of the most privileged humans in the system.
 *
 * So it carries a constant. The wave's own rule is "no email body and no PII
 * beyond a name", and the console is one tap away.
 */
const ITEM_SIGNALS: Partial<
  Record<string, { prefKey: AlertPrefKey; title: string; body: (item: ShellSignalItem) => string }>
> = {
  inbox: {
    prefKey: 'newSupportThreads',
    title: 'New support thread',
    // No correspondent, no address, no subject — see the docblock above.
    body: () => 'Someone has written to a support mailbox. Open the console to read it.',
  },
  // Community name, days past due and MRR: all ours, none of it authored by
  // anyone outside the platform, and the alert is useless without the client.
  billing: { prefKey: 'paymentFailures', title: 'Payment problem', body: trayText },
  // A request type and two dates, both computed here.
  deletion: { prefKey: 'deletionReminders', title: 'Deletion scheduled', body: trayText },
};

/** `YYYY-MM-DD` in the deployment's local time, for the digest fingerprint. */
function localDayStamp(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Turn one operator's view of the console into the notifications they opted in
 * to. Pure.
 *
 * Order is critical-first, then tray order (which `getShellSignals` has already
 * sorted newest-first). That ordering is observable: it is the order they are
 * sent in, and therefore the order they arrive.
 *
 * Leads are the one category that is NOT per item. The settings row promises "a
 * daily digest instead of a push per lead", so this emits at most one candidate
 * per calendar day, fingerprinted on that day — which is also what makes the
 * four ticks inside the 08:00 hour produce one notification rather than four,
 * since the last three are already in the ledger.
 */
export function candidatesFromSignals(
  signals: ShellSignals,
  prefs: AlertPrefs,
  now: Date = new Date(),
): PushCandidate[] {
  const candidates: PushCandidate[] = [];

  if (prefs.errorSpikes && signals.critical) {
    candidates.push({
      fingerprint: signals.critical.fingerprint,
      title: 'Production error spike',
      // `shortText`, NOT `text`. The banner's long form embeds
      // `cron_runs.last_error` and the top Sentry issue's title — the first is
      // withheld even from web's unauthenticated cron-health probe because it
      // "can carry query text or table internals", and the second routinely
      // carries user identifiers lifted out of an error message. `shortText` is
      // a count or a job name: enough to know what broke, and nothing lifted
      // out of a failure.
      body: signals.critical.shortText,
      url: signals.critical.href,
      prefKey: 'errorSpikes',
    });
  }

  for (const item of signals.items) {
    const mapping = ITEM_SIGNALS[item.key];
    if (!mapping) continue;
    if (!prefs[mapping.prefKey]) continue;
    candidates.push({
      fingerprint: item.id,
      title: mapping.title,
      body: mapping.body(item),
      url: item.href,
      prefKey: mapping.prefKey,
    });
  }

  if (
    prefs.newLeadsDigest &&
    signals.counts.leads > 0 &&
    now.getHours() === LEADS_DIGEST_HOUR
  ) {
    const count = signals.counts.leads;
    candidates.push({
      fingerprint: `leads:digest:${localDayStamp(now)}`,
      title: 'New leads',
      body: `${count} new ${count === 1 ? 'lead' : 'leads'} since yesterday`,
      url: '/leads',
      prefKey: 'newLeadsDigest',
    });
  }

  return candidates;
}

/**
 * Drop candidates already sent, and return the ledger to persist. Pure.
 *
 * The returned `nextSent` keeps the LAST `PUSH_FINGERPRINT_LIMIT` entries —
 * newest at the end — so the bound discards the oldest history rather than
 * refusing to record anything new once it is full.
 *
 * Duplicates WITHIN one tick are collapsed too: two providers can legitimately
 * surface the same underlying thing, and sending it twice in one batch is the
 * same bug the ledger exists to prevent, one tick earlier.
 */
export function selectUnsent(
  candidates: PushCandidate[],
  sent: string[],
): { send: PushCandidate[]; nextSent: string[] } {
  const seen = new Set(sent);
  const send: PushCandidate[] = [];

  for (const candidate of candidates) {
    if (seen.has(candidate.fingerprint)) continue;
    seen.add(candidate.fingerprint);
    send.push(candidate);
  }

  const nextSent = [...sent, ...send.map((c) => c.fingerprint)];
  return {
    send,
    nextSent: nextSent.slice(Math.max(0, nextSent.length - PUSH_FINGERPRINT_LIMIT)),
  };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/** The four columns a send needs. Bookkeeping columns are not read here. */
export interface PushSubscriptionRecord {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushDeps {
  listAdmins(): Promise<Array<{ userId: string }>>;
  getPreferences(userId: string): Promise<AdminPreferences>;
  getSignals(errorsPerHour: number): Promise<ShellSignals>;
  listSubscriptions(userId: string): Promise<PushSubscriptionRecord[]>;
  sendNotification(subscription: PushSubscriptionRecord, payload: string): Promise<void>;
  deleteSubscription(id: number): Promise<void>;
  recordFailure(id: number): Promise<void>;
  persistSent(userId: string, fingerprints: string[]): Promise<void>;
  now(): Date;
}

export interface PushDispatchResult {
  /**
   * False when no VAPID keys are configured and no sender was injected. The
   * route reports this as a 200 — "nothing to do", not a failure — because a
   * cron route that answers non-2xx is retried forever.
   */
  configured: boolean;
  admins: number;
  sent: number;
  failed: number;
  pruned: number;
}

/** The payload `public/sw.js`'s `push` handler parses. Keep the two in step. */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

/**
 * Are the VAPID keys present?
 *
 * The PUBLIC key is read from `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — one variable for
 * both the browser (which needs it to mint a subscription) and the server
 * (which signs with the matching private key). Two separate variables for the
 * same value is a configuration that can silently disagree, and a subscription
 * minted against the wrong public key fails at delivery time, not at subscribe
 * time.
 */
export function vapidConfig(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  // A mailto: or https: subject is required by RFC 8292; push services reject a
  // missing one, so this falls back rather than sending an unsigned request.
  const subject = process.env.VAPID_SUBJECT || 'mailto:support@getpropertypro.com';
  return { publicKey, privateKey, subject };
}

/** `410 Gone` / `404 Not Found` mean the browser threw the subscription away. */
function isGoneStatus(error: unknown): boolean {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return status === 410 || status === 404;
}

function defaultDeps(): PushDeps {
  return {
    async listAdmins() {
      const db = createAdminTypedClient();
      const { data, error } = await db.from('platform_admin_users').select('user_id');
      if (error) throw new Error(`platform_admin_users read failed: ${error.message}`);
      return (data ?? []).map((row) => ({ userId: (row as { user_id: string }).user_id }));
    },
    getPreferences,
    getSignals: (errorsPerHour: number) => getShellSignals(errorsPerHour),
    async listSubscriptions(userId: string) {
      const db = createAdminTypedClient();
      const { data, error } = await db
        .from('platform_admin_push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', userId);
      if (error) throw new Error(`push subscriptions read failed: ${error.message}`);
      return (data ?? []) as Array<
        Pick<PlatformAdminPushSubscriptionRow, 'id' | 'endpoint' | 'p256dh' | 'auth'>
      >;
    },
    async sendNotification(subscription, payload) {
      const config = vapidConfig();
      // Unreachable while `dispatchPush` gates on `configured`, but this
      // function is the one that would otherwise POST unsigned.
      if (!config) throw new Error('VAPID keys are not configured');
      // Imported lazily and per call: `web-push` reads nothing at import time,
      // but keeping it out of the module's top level means a route that only
      // touches the pure helpers does not pull it in.
      const webpush = (await import('web-push')).default;
      webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
      );
    },
    async deleteSubscription(id: number) {
      const db = createAdminTypedClient();
      const { error } = await db.from('platform_admin_push_subscriptions').delete().eq('id', id);
      if (error) throw new Error(`push subscription delete failed: ${error.message}`);
    },
    async recordFailure(id: number) {
      // Read-then-write rather than an atomic increment: PostgREST has no
      // `col = col + 1` without an RPC, and this is bookkeeping — a lost
      // increment under concurrency costs nothing. There is only one writer
      // anyway (the cron, every fifteen minutes).
      const db = createAdminTypedClient();
      const { data } = await db
        .from('platform_admin_push_subscriptions')
        .select('failure_count')
        .eq('id', id)
        .maybeSingle();
      const current = (data as { failure_count?: number } | null)?.failure_count ?? 0;
      await db
        .from('platform_admin_push_subscriptions')
        .update({ failure_count: current + 1 })
        .eq('id', id);
    },
    async persistSent(userId: string, fingerprints: string[]) {
      const db = createAdminTypedClient();
      const { error } = await db.from('platform_admin_preferences').upsert({
        user_id: userId,
        push_sent_fingerprints: fingerprints,
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(`push ledger write failed: ${error.message}`);
    },
    now: () => new Date(),
  };
}

/**
 * Send every operator the notifications they have opted into and not yet had.
 *
 * ## One operator's failure never stops another's
 *
 * The per-admin body is wrapped: a preferences read that fails, a signal
 * provider that throws, a push service that 500s — each is reported to Sentry
 * and counted, and the loop continues. This runs unattended every fifteen
 * minutes; a throw would mean one broken subscription silences the whole
 * platform's alerting, which is the failure mode alerting exists to prevent.
 *
 * ## A gone subscription is pruned once and then skipped
 *
 * `410 Gone` / `404` means the browser discarded the subscription — every
 * further send to that endpoint in the same tick would fail identically. So the
 * endpoint is marked gone, skipped for the remaining candidates, and deleted
 * once at the end of the operator's batch. (The plan sketched re-attempting
 * every candidate against a known-gone endpoint; that only buys a higher
 * `failed` count and N pointless outbound requests per tick.)
 *
 * ## The ledger is written once, from the operator's whole batch — and only if
 * something arrived
 *
 * Not per successful send. A fingerprint records "this operator has been told
 * about this thing", and an operator with two devices where one is offline has
 * still been told. Persisting per-send would re-notify their working device on
 * the next tick every time the broken one failed.
 *
 * But a batch where NOTHING was delivered is not a batch that was told. The
 * ledger is permanent for those fingerprints (nothing removes an entry but the
 * 200-item trim), so recording an undelivered batch suppresses that alert
 * forever — the failure mode alerting exists to prevent, written by the
 * alerting path itself. `deliveredHere === 0` is the whole condition.
 */
export async function dispatchPush(deps?: Partial<PushDeps>): Promise<PushDispatchResult> {
  const injectedSender = deps?.sendNotification !== undefined;
  const configured = injectedSender || vapidConfig() !== null;
  if (!configured) {
    return { configured: false, admins: 0, sent: 0, failed: 0, pruned: 0 };
  }

  const resolved: PushDeps = { ...defaultDeps(), ...deps };

  const admins = await resolved.listAdmins();
  let sent = 0;
  let failed = 0;
  let pruned = 0;

  for (const admin of admins) {
    try {
      const preferences = await resolved.getPreferences(admin.userId);
      const signals = await resolved.getSignals(preferences.alertPrefs.errorSpikeThreshold);
      const candidates = candidatesFromSignals(
        signals,
        preferences.alertPrefs,
        resolved.now(),
      );
      if (candidates.length === 0) continue;

      const subscriptions = await resolved.listSubscriptions(admin.userId);
      // No device to tell means nothing has been told — writing the ledger here
      // would make everything current silently un-notifiable the moment this
      // operator subscribes.
      if (subscriptions.length === 0) continue;

      const { send, nextSent } = selectUnsent(candidates, preferences.pushSentFingerprints);
      if (send.length === 0) continue;

      const gone = new Set<number>();
      let deliveredHere = 0;
      for (const candidate of send) {
        const payload: PushPayload = {
          title: candidate.title,
          body: candidate.body,
          url: candidate.url,
        };
        const serialized = JSON.stringify(payload);

        for (const subscription of subscriptions) {
          if (gone.has(subscription.id)) continue;
          try {
            await resolved.sendNotification(subscription, serialized);
            sent += 1;
            deliveredHere += 1;
          } catch (error) {
            failed += 1;
            if (isGoneStatus(error)) {
              gone.add(subscription.id);
              continue;
            }
            Sentry.captureException(error, {
              level: 'warning',
              tags: { push_dispatch: 'send' },
            });
            await resolved.recordFailure(subscription.id).catch(() => {});
          }
        }
      }

      for (const id of gone) {
        await resolved.deleteSubscription(id);
        pruned += 1;
      }

      // NOTHING REACHED ANYONE: do not record these as sent.
      //
      // This used to also require `gone.size === subscriptions.length`, which
      // made it the narrower "every device was gone" — so a tick where every
      // send failed for a NON-gone reason (the push service 500s, a network
      // blip, a bad VAPID signature) still wrote the whole batch's fingerprints
      // to the ledger. `selectUnsent` skips anything in the ledger and
      // fingerprints are stable by design, so a five-minute push-service outage
      // suppressed that incident's alert FOREVER. An alert that reached nobody
      // must not be recorded as delivered.
      //
      // `deliveredHere === 0` subsumes the all-gone case — pruning has already
      // happened above — and is exactly the condition this comment describes.
      // The converse stays deliberate: ONE device out of two succeeding IS
      // delivery, and is why the ledger is written per batch rather than per
      // send.
      if (deliveredHere === 0) continue;

      await resolved.persistSent(admin.userId, nextSent);
    } catch (error) {
      Sentry.captureException(error, {
        level: 'warning',
        tags: { push_dispatch: 'admin' },
      });
    }
  }

  return { configured: true, admins: admins.length, sent, failed, pruned };
}
