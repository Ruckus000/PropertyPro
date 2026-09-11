/**
 * The browser half of web push: mint a subscription against our VAPID public
 * key, tell the server about it, and take both apart again on unsubscribe.
 *
 * Kept out of `PushToggle` so the ordering rules below are testable without a
 * DOM: they are the part that goes wrong, and both of them fail in a way the
 * operator would read as success.
 *
 * ## The server is told BEFORE the toggle reports success
 *
 * `pushManager.subscribe()` succeeding means the BROWSER has a subscription. It
 * says nothing about us being able to use it. If the POST that registers it
 * fails, the browser is left holding a subscription no server knows about — the
 * operator sees "on", and no notification ever arrives. So a failed POST
 * unsubscribes again and reports failure, leaving both sides agreeing that push
 * is off.
 *
 * ## Unsubscribe tells the server FIRST
 *
 * The mirror image: dropping the browser subscription first and then failing to
 * reach the server leaves a row we will push to forever, addressed at an
 * endpoint that is already `410 Gone`. The dispatch loop does prune those, but
 * only after a failed delivery — it is not a reason to create them.
 */

/**
 * Thrown for the states the UI has to explain rather than retry.
 *
 * MESSAGE-ONLY, deliberately. This carried a `reason` discriminant
 * (`'unsupported' | 'not-configured' | 'permission-denied' | 'failed'`) that
 * nothing ever read — `PushToggle` renders `caught.message` — and whose
 * `permission-denied` variant was never constructed, because the denied case is
 * handled by `Notification.requestPermission()` in the component and never
 * reaches this module. A discriminant with no consumer and an unreachable member
 * is a type that describes an intention rather than the code. If a caller ever
 * needs to branch, add the union back with the branch that needs it.
 */
export class PushSubscribeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PushSubscribeError';
  }
}

/**
 * VAPID keys are base64url; `applicationServerKey` wants raw bytes.
 *
 * `atob` needs standard base64, so `-`/`_` are mapped back and the padding is
 * restored — a key that is not a multiple of four characters throws otherwise,
 * which is most of them.
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const normalized = padded.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  // Backed by an explicit ArrayBuffer, not the default ArrayBufferLike:
  // `applicationServerKey` is a `BufferSource`, which excludes a view over a
  // SharedArrayBuffer, and the unparameterised `Uint8Array` admits one.
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

/** The two keys the server needs, base64url, read off a live PushSubscription. */
export function serializeSubscription(subscription: PushSubscription): {
  endpoint: string;
  keys: { p256dh: string; auth: string };
} {
  const json = subscription.toJSON();
  const keys = json.keys ?? {};
  if (!json.endpoint || !keys.p256dh || !keys.auth) {
    throw new PushSubscribeError('The browser returned an incomplete subscription.');
  }
  return { endpoint: json.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

async function postSubscription(body: unknown): Promise<boolean> {
  const res = await fetch('/api/admin/push/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.ok;
}

/**
 * Subscribe this browser and register it server-side.
 *
 * `userVisibleOnly: true` is not optional — Chrome refuses a subscription
 * without it, and it is also the honest declaration: every push this console
 * sends shows a notification.
 */
export async function subscribeToPush(
  registration: ServiceWorkerRegistration,
  vapidPublicKey: string,
): Promise<void> {
  if (!vapidPublicKey) {
    throw new PushSubscribeError(
      'This deployment has no VAPID public key, so a subscription could not be delivered to.',
    );
  }
  if (!registration.pushManager) {
    throw new PushSubscribeError('This browser does not support push messaging.');
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  let ok = false;
  try {
    ok = await postSubscription(serializeSubscription(subscription));
  } catch {
    ok = false;
  }

  if (!ok) {
    // Leave both sides agreeing that push is off — see the module docblock.
    await subscription.unsubscribe().catch(() => {});
    throw new PushSubscribeError('We could not register this device for notifications.');
  }
}

/**
 * Unregister server-side, then drop the browser subscription.
 *
 * A browser with no subscription is already unsubscribed, so that is a success,
 * not an error — an operator toggling off twice must not see a failure.
 */
export async function unsubscribeFromPush(
  registration: ServiceWorkerRegistration,
): Promise<void> {
  const subscription = await registration.pushManager?.getSubscription();
  if (!subscription) return;

  const res = await fetch('/api/admin/push/subscriptions', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });

  if (!res.ok) {
    throw new PushSubscribeError(
      'We could not stop notifications for this device. Please try again.',
    );
  }

  await subscription.unsubscribe();
}
