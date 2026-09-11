// @vitest-environment jsdom
/**
 * The section's whole reason for existing is that most browsers never offer an
 * install. What it must never do is render a button that does nothing.
 */
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstallAppSection } from '@/components/settings/InstallAppSection';

function fireBeforeInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

function setNavigator(props: Record<string, unknown>) {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(window.navigator, key, { configurable: true, value });
  }
}

const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const DESKTOP_UA = window.navigator.userAgent;

describe('InstallAppSection', () => {
  afterEach(() => {
    setNavigator({ userAgent: DESKTOP_UA, maxTouchPoints: 0 });
    delete (window.navigator as Navigator & { standalone?: boolean }).standalone;
  });

  it('explains instead of rendering a dead button when the browser never offers one', () => {
    render(<InstallAppSection />);

    expect(screen.queryByRole('button', { name: /install app/i })).toBeNull();
    expect(screen.getByText(/hasn’t offered an install/i)).toBeTruthy();
  });

  it('renders the install button once the browser offers a prompt', () => {
    render(<InstallAppSection />);
    expect(screen.queryByRole('button', { name: /install app/i })).toBeNull();

    fireBeforeInstallPrompt();

    expect(screen.getByRole('button', { name: /install app/i })).toBeTruthy();
    expect(screen.queryByText(/hasn’t offered an install/i)).toBeNull();
  });

  it('reports the outcome and retires the button after prompting', async () => {
    render(<InstallAppSection />);
    fireBeforeInstallPrompt('accepted');

    await act(async () => {
      screen.getByRole('button', { name: /install app/i }).click();
    });

    expect(screen.getByRole('status').textContent).toMatch(/installed/i);
    // Single-use: replaying a spent prompt throws in Chrome.
    expect(screen.queryByRole('button', { name: /install app/i })).toBeNull();
  });

  it('gives iOS the Share-sheet instruction and no button, since a page cannot start it', () => {
    setNavigator({ userAgent: IOS_UA });
    render(<InstallAppSection />);

    expect(screen.getByText(/Add to Home Screen/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /install app/i })).toBeNull();
  });

  it('renders nothing at all once running as an installed app', () => {
    setNavigator({ standalone: true });
    const { container } = render(<InstallAppSection />);

    expect(container.textContent).toBe('');
  });

  // Read-only offline was an explicit scope decision, and the operator has to
  // know it before they install: a console that looked like it queued work
  // would be worse than one that never installed.
  it('says plainly that nothing is queued while offline', () => {
    render(<InstallAppSection />);
    expect(screen.getByText(/nothing is queued and sent\s+later/i)).toBeTruthy();
  });
});
