/**
 * Put text on the clipboard, or fall back to showing it.
 *
 * Lifted from `components/esign/submission-detail.tsx`, which was the only
 * implementation in the app. `navigator.clipboard` is undefined outside a
 * secure context — which includes `http://` on a LAN, i.e. every "let me show
 * you on my laptop" demo — so the prompt is a real path, not defensive noise.
 *
 * Three outcomes, not a boolean, because they need three different things said
 * about them. In particular: **a "Copied" toast after a prompt is a lie.** The
 * user was handed a dialog they may have cancelled, and the original code
 * collapsed that case into success and then reported nothing at all.
 *
 * Says nothing itself — kept free of `sonner` so it stays pure. The toasts
 * live in `use-copy-to-clipboard`.
 */
export type CopyOutcome =
  /** On the clipboard. Safe to confirm. */
  | 'copied'
  /** Shown in a prompt for the user to copy by hand. The prompt WAS the feedback. */
  | 'prompted'
  /** Neither worked. */
  | 'failed';

export async function copyText(text: string): Promise<CopyOutcome> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return 'copied';
    }
  } catch {
    // Permission policy can refuse it even where the API exists.
  }

  try {
    if (typeof window === 'undefined') return 'failed';
    window.prompt('Copy this link:', text);
    return 'prompted';
  } catch {
    // jsdom, and some embedded webviews, do not implement prompt.
    return 'failed';
  }
}
