'use client';

/**
 * Settings → "Push notifications on this device".
 *
 * Per DEVICE, not per operator — that is what the row in
 * `platform_admin_push_subscriptions` is, and the label says so, because the
 * five switches directly above it ARE per operator and a switch that looked
 * like a sixth one would be read that way.
 *
 * ## Nothing renders until after mount, and nothing lies about state
 *
 * Every input is a browser fact — `serviceWorker`, `PushManager`,
 * `Notification.permission`, the live subscription — so reading any of them
 * during render produces markup the server cannot reproduce. The section is
 * absent on the server pass and appears in the effect, the trade
 * `InstallAppSection` documents.
 *
 * The switch's checked state comes from `pushManager.getSubscription()`, never
 * from a local "the operator clicked it" flag. Optimism is right for a
 * preference row (`AlertPrefsSection`) and wrong here: the failure this screen
 * must not have is a switch reading "on" while no notification can arrive.
 *
 * ## Four states that are not a switch
 *
 * | condition                          | what it shows                          |
 * |------------------------------------|----------------------------------------|
 * | no service worker / no PushManager | why this browser cannot                |
 * | no VAPID key on this deployment    | that push is not configured here       |
 * | `Notification.permission === 'denied'` | that the block is in browser settings, which a page cannot undo |
 * | otherwise                          | the switch                             |
 *
 * The denied case is the one that matters: `requestPermission()` resolves
 * instantly with `denied` and shows nothing, so a switch there is a control
 * that visibly does nothing. Only the browser's own site settings can reverse
 * it.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertBanner, Switch } from '@propertypro/ui';

import { PushSubscribeError, subscribeToPush, unsubscribeFromPush } from '@/lib/pwa/push-subscribe';

type Support = 'pending' | 'unsupported' | 'not-configured' | 'ready';

/**
 * Inlined at build time. Public by definition — it is the key the browser sends
 * to the push service — but mark it NOT sensitive in Vercel: a variable stored
 * as sensitive is inlined as the literal `[SENSITIVE]`, which would mint every
 * subscription against nonsense.
 */
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export function PushToggle() {
  const [support, setSupport] = useState<Support>('pending');
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (
        typeof navigator === 'undefined' ||
        !('serviceWorker' in navigator) ||
        typeof window === 'undefined' ||
        !('PushManager' in window) ||
        !('Notification' in window)
      ) {
        if (!cancelled) setSupport('unsupported');
        return;
      }

      if (!VAPID_PUBLIC_KEY) {
        if (!cancelled) setSupport('not-configured');
        return;
      }

      // `ready` resolves once a worker controls this page. Registration happens
      // elsewhere (the PWA bootstrap); this only waits for it.
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (cancelled) return;
      setPermission(Notification.permission);
      setSubscribed(existing !== null);
      setSupport('ready');
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(async (next: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;

      if (!next) {
        await unsubscribeFromPush(registration);
        setSubscribed(false);
        return;
      }

      // Asked only on enable, and only once per browser — a permission prompt
      // on page load is the pattern browsers now suppress outright.
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') {
        // Not an error banner: refusing is a legitimate answer, and the denied
        // explanation below now renders instead of the switch.
        setSubscribed(false);
        return;
      }

      await subscribeToPush(registration, VAPID_PUBLIC_KEY);
      setSubscribed(true);
    } catch (caught) {
      setSubscribed(false);
      setError(
        caught instanceof PushSubscribeError
          ? caught.message
          : 'We could not change notifications for this device. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }, []);

  if (support === 'pending') return null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-content-tertiary">
        Push notifications
      </h2>

      {error && (
        <div className="mb-3">
          <AlertBanner status="danger" title="Notifications not changed" description={error} />
        </div>
      )}

      <div className="rounded-lg border border-edge bg-surface-card p-4 shadow-e1">
        {support === 'unsupported' && (
          <p className="text-sm text-content-secondary">
            This browser cannot receive push notifications. Chrome, Edge and Android browsers
            can; on an iPhone or iPad, add the console to your Home Screen first.
          </p>
        )}

        {support === 'not-configured' && (
          <p className="text-sm text-content-secondary">
            Push notifications are not configured on this deployment yet, so this device cannot
            be subscribed. The alert preferences above still control the console banner and the
            notification tray.
          </p>
        )}

        {support === 'ready' && permission === 'denied' && (
          <p className="text-sm text-content-secondary">
            Notifications are blocked for this site in your browser&rsquo;s settings. This page
            cannot undo that — allow notifications for this site, then come back.
          </p>
        )}

        {support === 'ready' && permission !== 'denied' && (
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-content">
                Push notifications on this device
              </p>
              <p className="mt-0.5 text-xs text-content-tertiary">
                Sends the alerts you chose above to this browser, even when the console is
                closed. Each device is subscribed separately.
              </p>
            </div>
            <Switch
              aria-label="Push notifications on this device"
              checked={subscribed}
              disabled={busy}
              onCheckedChange={(next) => void toggle(next)}
              className="shrink-0"
            />
          </div>
        )}
      </div>
    </section>
  );
}
