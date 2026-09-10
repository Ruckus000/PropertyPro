// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { format } from 'date-fns';
import { afterEach, describe, expect, it } from 'vitest';
import { OfflineBanner } from '@/components/shell/OfflineBanner';

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}

describe('OfflineBanner', () => {
  afterEach(() => setOnline(true));

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
