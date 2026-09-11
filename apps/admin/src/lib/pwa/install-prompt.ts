/**
 * A small wrapper over the browser's install flow, so `InstallAppSection` can
 * be a progressive enhancement instead of a guess about which browser is open.
 *
 * ## Why a controller and not a hook
 *
 * `beforeinstallprompt` fires ONCE, early, and often before React has mounted
 * anything. A hook that registers its listener in an effect misses it and the
 * install button never becomes live. This controller is constructed in an
 * effect too — it has to be, it touches `window` — but it captures the event
 * defensively and the component subscribes for the re-render, so the two
 * concerns stay separable and the capture logic is testable without React.
 *
 * ## The three answers `prompt()` can give
 *
 * `'unavailable'` is not a failure. Firefox and desktop Safari never fire
 * `beforeinstallprompt` at all; iOS Safari installs only through the Share
 * sheet; Chrome withholds it until its own engagement heuristics are satisfied.
 * The caller must be able to tell "the browser declined to offer this" apart
 * from "the operator said no", because only the second one is about intent.
 */

/**
 * Chrome's `BeforeInstallPromptEvent`. Not in the DOM lib — it is not a
 * standard, which is exactly why the rest of this module treats its absence as
 * ordinary.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

export interface InstallPromptController {
  /** Whether a real browser install prompt is waiting to be shown. */
  canInstall(): boolean;
  /** Show it. Resolves `'unavailable'` when there is nothing to show. */
  prompt(): Promise<InstallOutcome>;
  /** iOS/iPadOS, where installing is a Share-sheet action the page cannot trigger. */
  isIos: boolean;
  /** Already running as an installed app, so there is nothing to offer. */
  isStandalone: boolean;
  /** Re-render hook for React. Returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Drop the window listener. */
  destroy(): void;
}

function detectIos(win: Window): boolean {
  const nav = win.navigator;
  if (/iPad|iPhone|iPod/.test(nav.userAgent)) return true;
  // iPadOS 13+ reports a desktop Safari UA. A touch-capable "Mac" is an iPad;
  // no Mac reports more than one touch point.
  return nav.platform === 'MacIntel' && nav.maxTouchPoints > 1;
}

function detectStandalone(win: Window): boolean {
  // Safari (both iOS and macOS) sets a non-standard `navigator.standalone`
  // and did not support the `display-mode` media query for years; Chrome and
  // Firefox only have the media query. Both are checked because neither alone
  // covers the browsers that can install this app.
  if ((win.navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  if (typeof win.matchMedia !== 'function') return false;
  return win.matchMedia('(display-mode: standalone)').matches;
}

export function captureInstallPrompt(win: Window): InstallPromptController {
  let deferred: BeforeInstallPromptEvent | null = null;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const onBeforeInstallPrompt = (event: Event) => {
    // Suppress Chrome's own mini-infobar. The console offers the install from
    // Settings, where it is explained, rather than as a bar over the operator's
    // work — and once prevented, the event is ours to replay later.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  };

  // The event may have fired before this ran; nothing can recover it, and the
  // component's fallback copy is what covers that case.
  win.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);

  return {
    isIos: detectIos(win),
    isStandalone: detectStandalone(win),
    canInstall: () => deferred !== null,
    async prompt(): Promise<InstallOutcome> {
      const event = deferred;
      if (!event) return 'unavailable';

      // A deferred prompt is single-use whatever the operator answers, so it is
      // dropped BEFORE awaiting. Clearing it afterwards would leave a live
      // button during the dialog, and a second click throws.
      deferred = null;
      notify();

      try {
        await event.prompt();
        const { outcome } = await event.userChoice;
        return outcome;
      } catch {
        // The browser refused to show it (already installed in another window,
        // or the gesture went stale). Nothing was chosen.
        return 'unavailable';
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      win.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      listeners.clear();
      deferred = null;
    },
  };
}
