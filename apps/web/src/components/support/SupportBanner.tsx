'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, X } from 'lucide-react';
import { useEndSupportSession } from '@/hooks/use-end-support-session';

interface SupportBannerProps {
  /**
   * Whether an impersonation session is active, resolved server-side from the
   * `x-support-session` header that middleware stamps after verifying the
   * signed cookie against a live `support_sessions` row.
   *
   * This used to be a `document.cookie` sniff in a `useEffect`. The cookie is
   * now HttpOnly — deliberately, so an XSS on any tenant subdomain cannot read
   * a live impersonation token — which makes it invisible to JavaScript. The
   * header is also a better signal: the old check saw only that *a* cookie
   * existed, so an expired or revoked session still rendered the banner.
   */
  active: boolean;
}

export function SupportBanner({ active }: SupportBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const router = useRouter();
  const endSession = useEndSupportSession();

  if (!active || dismissed) return null;

  const handleEndSession = () => {
    endSession.mutate(undefined, {
      onSuccess: () => {
        setDismissed(true);
        // `router.refresh()`, not just `push` — the impersonated identity is
        // applied in middleware, so the server components must re-render
        // against a request that no longer carries the cookie. A client-side
        // navigation alone would keep the impersonated shell.
        router.push('/dashboard');
        router.refresh();
      },
      // On failure the session is still live. Keep the banner, and its End
      // Session control, on screen rather than implying the operator has left
      // impersonation when they have not.
    });
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed left-0 right-0 top-0 z-[9999] flex items-center justify-between bg-status-warning px-4 py-2 text-sm font-medium text-content-inverse"
    >
      <div className="flex items-center gap-2">
        <Eye size={16} aria-hidden="true" />
        <span>Support Mode — Read-Only</span>
      </div>
      <button
        type="button"
        onClick={handleEndSession}
        disabled={endSession.isPending}
        className="flex items-center gap-1.5 rounded-md border border-status-warning-border px-3 py-1 text-xs font-semibold text-content-inverse hover:opacity-80 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-interactive"
      >
        <X size={12} aria-hidden="true" />
        {endSession.isPending ? 'Ending…' : 'End Session'}
      </button>
    </div>
  );
}
