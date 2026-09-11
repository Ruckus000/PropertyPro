/**
 * The service worker's `push` and `notificationclick` handlers, RUN rather than
 * grepped.
 *
 * `public/sw.js` is a plain script with no build step and no imports, so the
 * only way to test it is to evaluate it against a fake `self` and capture the
 * listeners it registers. That is worth doing here: the two properties below
 * are both invisible in review and both fail in production only.
 *
 * - A push with no (or unparseable) body must still show a notification. The
 *   subscription declared `userVisibleOnly`, and a push that shows nothing
 *   counts against that promise — browsers revoke subscriptions that do it
 *   repeatedly.
 * - The notification's `url` is attacker-influenceable in principle (it is a
 *   payload field), so a click must never navigate off-origin.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const ORIGIN = 'https://admin.getpropertypro.com';

interface FakeClient {
  url: string;
  focus: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
}

function loadWorker(clients: FakeClient[] = []) {
  const source = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
  const listeners = new Map<string, (event: unknown) => void>();

  const showNotification = vi.fn();
  const openWindow = vi.fn(async () => ({}));

  const self = {
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      listeners.set(type, handler);
    },
    location: { origin: ORIGIN },
    registration: { showNotification },
    clients: {
      matchAll: vi.fn(async () => clients),
      openWindow,
      claim: vi.fn(),
    },
    skipWaiting: vi.fn(),
  };

  runInNewContext(source, {
    self,
    caches: { open: vi.fn(), keys: vi.fn(async () => []), delete: vi.fn(), match: vi.fn() },
    fetch: vi.fn(),
    Response,
    Headers,
    Request,
    URL,
    Date,
    console,
    Promise,
  });

  return { listeners, showNotification, openWindow, clients };
}

async function firePush(data: unknown): Promise<ReturnType<typeof loadWorker>> {
  const worker = loadWorker();
  const handler = worker.listeners.get('push');
  expect(handler, 'sw.js must register a push listener').toBeDefined();

  let waited: unknown;
  handler!({
    data,
    waitUntil: (promise: unknown) => {
      waited = promise;
    },
  });
  await waited;
  return worker;
}

describe('sw.js push handler', () => {
  it('shows the notification the server sent', async () => {
    const { showNotification } = await firePush({
      json: () => ({ title: 'Payment problem', body: 'Bayview is 19 days past due', url: '/clients/1' }),
    });

    expect(showNotification).toHaveBeenCalledWith('Payment problem', {
      body: 'Bayview is 19 days past due',
      data: { url: '/clients/1' },
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: '/clients/1',
    });
  });

  it('still shows SOMETHING when the push carries no data at all', async () => {
    const { showNotification } = await firePush(null);
    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification.mock.calls[0]![0]).toBe('PropertyPro console');
  });

  it('still shows something when the body is not JSON', async () => {
    const { showNotification } = await firePush({
      json: () => {
        throw new SyntaxError('not json');
      },
    });
    expect(showNotification).toHaveBeenCalledTimes(1);
  });

  it.each(['https://evil.example/steal', '//evil.example/steal', 'javascript:alert(1)', ''])(
    'refuses %j as a click target and falls back to the console root',
    async (url) => {
      const { showNotification } = await firePush({
        json: () => ({ title: 't', body: 'b', url }),
      });
      expect(showNotification.mock.calls[0]![1].data).toEqual({ url: '/' });
    },
  );
});

describe('sw.js notificationclick handler', () => {
  async function fireClick(worker: ReturnType<typeof loadWorker>, url: string) {
    const handler = worker.listeners.get('notificationclick');
    expect(handler, 'sw.js must register a notificationclick listener').toBeDefined();
    const close = vi.fn();
    let waited: unknown;
    handler!({
      notification: { close, data: { url } },
      waitUntil: (promise: unknown) => {
        waited = promise;
      },
    });
    await waited;
    return close;
  }

  it('focuses a window already on that URL rather than opening another', async () => {
    const match: FakeClient = {
      url: `${ORIGIN}/clients/1`,
      focus: vi.fn(),
      navigate: vi.fn(),
    };
    const worker = loadWorker([match]);
    const close = await fireClick(worker, '/clients/1');

    expect(close).toHaveBeenCalled();
    expect(match.focus).toHaveBeenCalled();
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it('reuses an open console window by navigating it', async () => {
    const other: FakeClient = {
      url: `${ORIGIN}/dashboard`,
      focus: vi.fn(),
      navigate: vi.fn(),
    };
    const worker = loadWorker([other]);
    await fireClick(worker, '/clients/1');

    expect(other.focus).toHaveBeenCalled();
    expect(other.navigate).toHaveBeenCalledWith(`${ORIGIN}/clients/1`);
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it('opens a window when no console window is open', async () => {
    const worker = loadWorker([]);
    await fireClick(worker, '/health');
    expect(worker.openWindow).toHaveBeenCalledWith(`${ORIGIN}/health`);
  });

  // Second lock on the same door: the push handler already refuses a
  // non-rooted url, but a notification created by an OLDER worker build is
  // clicked by THIS one, and that is the case only this check covers.
  it.each(['https://evil.example/steal', '//evil.example/steal', 'javascript:alert(1)'])(
    'never navigates off-origin for a stored url of %j',
    async (url) => {
      const worker = loadWorker([]);
      await fireClick(worker, url);
      expect(worker.openWindow).toHaveBeenCalledWith(`${ORIGIN}/`);
    },
  );
});
