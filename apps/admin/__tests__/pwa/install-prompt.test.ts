// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { captureInstallPrompt } from '@/lib/pwa/install-prompt';

function fireBeforeInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome }),
  });
  window.dispatchEvent(event);
  return { event, prompt };
}

describe('captureInstallPrompt', () => {
  it('reports unavailable until the browser fires beforeinstallprompt, then prompts', async () => {
    const ip = captureInstallPrompt(window);
    expect(ip.canInstall()).toBe(false);
    expect(await ip.prompt()).toBe('unavailable');

    fireBeforeInstallPrompt('accepted');

    expect(ip.canInstall()).toBe(true);
    expect(await ip.prompt()).toBe('accepted');
    ip.destroy();
  });

  it('returns the operator’s refusal as dismissed, which is not unavailable', async () => {
    const ip = captureInstallPrompt(window);
    fireBeforeInstallPrompt('dismissed');
    expect(await ip.prompt()).toBe('dismissed');
    ip.destroy();
  });

  // Chrome's mini-infobar is suppressed so the offer appears in Settings, where
  // it is explained, rather than over the operator's work.
  it('prevents the browser’s own install banner', () => {
    const ip = captureInstallPrompt(window);
    const { event } = fireBeforeInstallPrompt();
    expect(event.defaultPrevented).toBe(true);
    ip.destroy();
  });

  // A deferred prompt is single-use whatever the answer was. Replaying it
  // throws in Chrome, so the second call must report unavailable rather than
  // leaving a live-looking button.
  it('consumes the prompt, so a second call is unavailable', async () => {
    const ip = captureInstallPrompt(window);
    fireBeforeInstallPrompt('accepted');
    expect(await ip.prompt()).toBe('accepted');
    expect(ip.canInstall()).toBe(false);
    expect(await ip.prompt()).toBe('unavailable');
    ip.destroy();
  });

  it('notifies subscribers when a prompt becomes available and when it is spent', async () => {
    const ip = captureInstallPrompt(window);
    const listener = vi.fn();
    ip.subscribe(listener);

    fireBeforeInstallPrompt('accepted');
    expect(listener).toHaveBeenCalledTimes(1);

    await ip.prompt();
    expect(listener).toHaveBeenCalledTimes(2);
    ip.destroy();
  });

  it('reports unavailable when the browser refuses to show the prompt', async () => {
    const ip = captureInstallPrompt(window);
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn().mockRejectedValue(new Error('already installed')),
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });
    window.dispatchEvent(event);

    expect(await ip.prompt()).toBe('unavailable');
    ip.destroy();
  });

  it('stops capturing after destroy, so an unmounted section cannot go live', () => {
    const ip = captureInstallPrompt(window);
    ip.destroy();
    fireBeforeInstallPrompt();
    expect(ip.canInstall()).toBe(false);
  });

  it('detects a non-iOS, non-standalone desktop browser as the ordinary case', () => {
    const ip = captureInstallPrompt(window);
    // jsdom's default UA is a desktop Chrome-alike with no touch points.
    expect(ip.isIos).toBe(false);
    expect(ip.isStandalone).toBe(false);
    ip.destroy();
  });

  it('reads standalone from Safari’s non-standard navigator flag', () => {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    nav.standalone = true;
    try {
      expect(captureInstallPrompt(window).isStandalone).toBe(true);
    } finally {
      delete nav.standalone;
    }
  });

  // iPadOS 13+ sends a desktop Safari user agent. Touch points are the only
  // thing separating it from a real Mac, which cannot install this app.
  it('detects iPadOS behind its desktop user agent', () => {
    const nav = window.navigator;
    const platform = Object.getOwnPropertyDescriptor(Navigator.prototype, 'platform');
    Object.defineProperty(nav, 'platform', { value: 'MacIntel', configurable: true });
    Object.defineProperty(nav, 'maxTouchPoints', { value: 5, configurable: true });
    try {
      expect(captureInstallPrompt(window).isIos).toBe(true);
    } finally {
      Object.defineProperty(nav, 'maxTouchPoints', { value: 0, configurable: true });
      if (platform) Object.defineProperty(Navigator.prototype, 'platform', platform);
    }
  });
});
