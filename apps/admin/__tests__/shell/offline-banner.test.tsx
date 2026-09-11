// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { format } from 'date-fns';
import { afterEach, describe, expect, it } from 'vitest';
import { OfflineBanner } from '@/components/shell/OfflineBanner';
import {
  resetServedFromCache,
  setServedFromCache,
} from '@/lib/pwa/served-from-cache';

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}

describe('OfflineBanner', () => {
  afterEach(() => {
    setOnline(true);
    resetServedFromCache();
  });

  it('renders nothing while online', () => {
    setOnline(true);
    render(<OfflineBanner />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders the offline message when navigator.onLine is false', () => {
    setOnline(false);
    render(<OfflineBanner />);
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('offline');
    expect(status.textContent).not.toContain('showing data cached');
  });

  it('includes an absolute cached-at time when supplied, not a relative one that goes stale', () => {
    // Finding 4 (review): the banner's only re-render trigger is the
    // online/offline events, so a relative string ("less than a minute ago")
    // computed once would keep reading as fresh for the whole outage. Assert
    // the actual formatted clock time is present instead of a substring that
    // would stay green whether the timestamp is absolute or relative.
    setOnline(false);
    const cachedAt = new Date('2026-03-01T14:32:00.000Z');
    render(<OfflineBanner cachedAt={cachedAt.toISOString()} />);
    const text = screen.getByRole('status').textContent ?? '';
    expect(text).toContain('showing data cached');
    expect(text).toContain(format(cachedAt, 'MMM d, HH:mm'));
  });

  // Task 30: the service worker reports the moment it actually stored the page
  // it just served. That is the more precise fact, so it wins over the signal
  // payload's `generatedAt` when it arrives.
  it('prefers the service worker’s cached-at over the prop', () => {
    setOnline(false);
    const fromProp = new Date('2026-03-01T14:32:00.000Z');
    const fromWorker = new Date('2026-03-01T09:05:00.000Z');
    render(<OfflineBanner cachedAt={fromProp.toISOString()} />);

    act(() => setServedFromCache(fromWorker.toISOString()));

    const text = screen.getByRole('status').textContent ?? '';
    expect(text).toContain(format(fromWorker, 'MMM d, HH:mm'));
    expect(text).not.toContain(format(fromProp, 'MMM d, HH:mm'));
  });

  // A full reload while offline is served before the new document exists as a
  // client, so the worker's message has nobody to reach. The prop — the signal
  // payload's own stamp, baked into the cached HTML — is the right fallback,
  // and losing it would leave the banner with no time at all in the single most
  // common offline case.
  it('falls back to the prop when the worker never reports', () => {
    setOnline(false);
    const fromProp = new Date('2026-03-01T14:32:00.000Z');
    render(<OfflineBanner cachedAt={fromProp.toISOString()} />);
    expect(screen.getByRole('status').textContent ?? '').toContain(
      format(fromProp, 'MMM d, HH:mm'),
    );
  });

  it('reacts to the offline/online events after mount', () => {
    setOnline(true);
    render(<OfflineBanner />);
    expect(screen.queryByRole('status')).toBeNull();

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('status')).toBeTruthy();

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
