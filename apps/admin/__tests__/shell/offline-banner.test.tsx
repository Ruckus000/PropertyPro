// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
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

  it('includes the cached-at relative time when supplied', () => {
    setOnline(false);
    const cachedAt = new Date(Date.now() - 5 * 60_000).toISOString();
    render(<OfflineBanner cachedAt={cachedAt} />);
    expect(screen.getByRole('status').textContent).toContain('showing data cached');
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
