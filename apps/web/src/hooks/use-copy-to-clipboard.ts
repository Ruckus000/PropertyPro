'use client';

/**
 * Copy, and say so honestly.
 *
 * The one existing copy button in the app (`submission-detail.tsx`) wrote to
 * the clipboard and gave no feedback at all — pressing it looked identical to
 * a broken button.
 *
 * Two feedback channels, deliberately, because they reach different people:
 * the toast is what a screen-reader user hears (sonner's toaster is the live
 * region), and the inline "Copied" swap is for the eye, because in a long list
 * a toast at the screen edge is nowhere near the button that was clicked.
 *
 * Nothing is said on the prompt fallback — the prompt was the feedback, and
 * claiming a copy the user may have cancelled would be a lie.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { copyText } from '@/lib/utils/copy-to-clipboard';

const COPIED_FOR_MS = 2000;

export function useCopyToClipboard(resetMs = COPIED_FOR_MS) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A row can unmount on a list refetch while the timer is pending.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string, successMessage = 'Copied to clipboard.') => {
      const outcome = await copyText(text);

      if (outcome === 'copied') {
        toast.success(successMessage);
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), resetMs);
      } else if (outcome === 'failed') {
        toast.error('We couldn’t copy that link. Select it and copy it manually.');
      }

      return outcome;
    },
    [resetMs],
  );

  return { copy, copied };
}
