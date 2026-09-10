/**
 * Persisted "keep navigation open" preference for `AdminRail`.
 *
 * `localStorage` throws in Safari private mode (and can throw under strict
 * cookie/storage policies generally), so every access is try/catch wrapped —
 * a storage failure degrades to "unpinned", never to a crash.
 */
const KEY = 'ppro-admin-nav-pinned';

export function readPinned(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true';
  } catch {
    return false;
  }
}

export function writePinned(v: boolean): void {
  try {
    localStorage.setItem(KEY, String(v));
  } catch {
    // Private mode / storage disabled — the preference simply won't persist.
  }
}
