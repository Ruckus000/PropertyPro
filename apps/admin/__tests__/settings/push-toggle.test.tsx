// @vitest-environment jsdom
/**
 * `PushToggle`'s support detection — specifically the state that used to be no
 * state at all.
 *
 * `navigator.serviceWorker.ready` is not "is one registered?", it is "wait until
 * one controls this page", and it NEVER SETTLES when nothing is registered.
 * `ServiceWorkerRegistration` registers only under `NODE_ENV === 'production'`
 * and swallows failures, so in development, in a private window with site data
 * blocked, and under an enterprise policy that blocks workers, the component sat
 * on `support === 'pending'` and rendered `null` forever — the `unsupported`
 * explanation was missing in exactly the cases it exists to give.
 *
 * `.claude/rules/design.md`: a data-dependent view must handle every state, and
 * one that can hang with nothing rendered is a missing state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

/** A `ready` that never settles — what the browser really gives you. */
const neverSettles = new Promise<never>(() => {});

function installServiceWorker(registration: unknown) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: registration ? Promise.resolve(registration) : neverSettles,
      getRegistration: async () => registration ?? undefined,
    },
  });
}

beforeEach(() => {
  vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('Notification', { permission: 'default', requestPermission: async () => 'granted' });

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

/**
 * `VAPID_PUBLIC_KEY` is read at MODULE LOAD (Next inlines the literal), so the
 * env has to be set before the import — which means a fresh module per case.
 */
async function render(vapidKey = 'BPublicKey') {
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', vapidKey);
  vi.resetModules();
  const { PushToggle } = await import('@/components/settings/PushToggle');

  await act(async () => {
    root.render(<PushToggle />);
  });
  // One more flush: the effect awaits before it can settle on a state.
  await act(async () => {});
}

describe('PushToggle support detection', () => {
  it('explains itself when NO worker is registered, instead of rendering nothing', async () => {
    installServiceWorker(null);

    await render();

    expect(container.textContent).toContain('Push notifications');
    expect(container.textContent).toContain('can’t receive push notifications');
    // And it must not claim the deployment is unconfigured — the VAPID key is
    // present; the registration is what is missing.
    expect(container.textContent).not.toContain('not configured on this deployment');
  });

  it('shows the switch once a worker IS registered', async () => {
    installServiceWorker({ pushManager: { getSubscription: async () => null } });

    await render();

    const toggle = container.querySelector('[aria-label="Push notifications on this device"]');
    expect(toggle, 'the switch should render for a registered worker').toBeTruthy();
    expect(container.textContent).not.toContain('can’t receive push notifications');
  });

  // Anti-vacuity for the case above: with no VAPID key the effect returns before
  // it ever asks about a registration, so `not-configured` must still win.
  it('still reports an unconfigured deployment before asking about registration', async () => {
    installServiceWorker(null);

    await render('');

    expect(container.textContent).toContain('not configured on this deployment');
  });
});
