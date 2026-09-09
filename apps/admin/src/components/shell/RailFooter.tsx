'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { LogOut } from 'lucide-react';
import { ADMIN_COOKIE_OPTIONS } from '@/lib/auth/cookie-config';
import { cn } from '@/lib/utils';

interface RailFooterProps {
  user: { email: string; initial: string };
  /** Whether the rail is currently showing its expanded (labeled) state. */
  expanded: boolean;
}

/**
 * Identity row + sign-out control, rendered as `AdminRail`'s / `AdminDrawer`'s
 * `footer`.
 *
 * `handleSignOut` below is moved VERBATIM from the old `Sidebar.tsx` — same
 * `ADMIN_COOKIE_OPTIONS`, same inspection of the returned `{ error }`, same
 * failure copy, same refusal to navigate on failure. See its docblock for why
 * that matters; do not simplify it.
 */
export function RailFooter({ user, expanded }: RailFooterProps) {
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);

  /**
   * Sign out client-side, matching apps/web's ProfileMenu.
   *
   * This replaces a `<form action="/api/auth/signout" method="POST">` that
   * posted to a route which has never existed in this app — clicking "Sign out"
   * 404'd and left the session intact.
   *
   * ADMIN_COOKIE_OPTIONS is required: the admin session cookie is named
   * `sb-admin-auth-token`, so a default browser client would clear the web
   * app's cookie name instead and leave the operator still signed in.
   *
   * We MUST inspect the returned `{ error }` rather than relying on a catch:
   * supabase-js resolves rather than throws on a failed logout, and its
   * `_signOut` returns early — *before* clearing the local session — for any
   * GoTrue failure that is not a 401/403/404 (a network error, a 5xx, or a 429
   * from the logout rate limit). Navigating away regardless would leave a live
   * `sb-admin-auth-token` behind while telling the operator they were signed
   * out; `/auth/login` is a public path, so middleware would not bounce them
   * and the next person at a shared workstation would inherit a privileged
   * console session. Retrying with `scope: 'local'` is not a fallback — that
   * path issues the same network call first.
   */
  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutFailed(false);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      setSigningOut(false);
      setSignOutFailed(true);
      return;
    }

    try {
      const supabase = createBrowserClient(url, key, {
        cookieOptions: ADMIN_COOKIE_OPTIONS,
      });
      const { error } = await supabase.auth.signOut();
      if (error) {
        setSigningOut(false);
        setSignOutFailed(true);
        return;
      }
    } catch {
      setSigningOut(false);
      setSignOutFailed(true);
      return;
    }

    // Hard navigation so middleware re-runs and the server sees the cleared cookie.
    window.location.href = '/auth/login';
  }

  return (
    <div className="border-t border-edge-subtle px-2 py-3">
      <div className="flex items-center gap-2.5 px-1 py-1.5">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-semibold text-content"
        >
          {user.initial}
        </span>
        <span
          className={cn(
            'min-w-0 flex-1 overflow-hidden transition-opacity',
            expanded ? 'opacity-100' : 'w-0 opacity-0',
          )}
        >
          <span className="block truncate text-sm font-medium text-content">{user.email}</span>
          <span className="block truncate text-xs text-content-tertiary">Super admin</span>
        </span>
      </div>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
        aria-label="Sign out"
        title={!expanded && signOutFailed ? 'Sign out failed — try again' : undefined}
        className={cn(
          'mt-1 flex w-full items-center rounded-md py-2 text-sm font-medium transition-colors disabled:opacity-60',
          signOutFailed
            ? 'text-status-danger hover:bg-surface-hover'
            : 'text-content-tertiary hover:bg-surface-hover hover:text-content',
          expanded ? 'gap-2.5 px-3' : 'justify-center px-2',
        )}
      >
        <LogOut size={16} className="shrink-0" aria-hidden="true" />
        {expanded && (signingOut ? 'Signing out…' : 'Sign out')}
      </button>
      {/*
        Never navigate away on failure: the session is still live, and
        silently landing on /auth/login would imply otherwise.

        This alert is rendered unconditionally on `signOutFailed` — NOT
        gated on `expanded` too. `expanded` here is `pinned || hovered`, so
        it can flip to false the instant the mouse leaves the rail, which
        can happen while the sign-out request is still in flight (click →
        move mouse away → request fails → `hovered` is now false). Gating
        the alert on `expanded` would unmount it the moment that happens,
        leaving the operator with only the icon turning red (see the
        `signOutFailed` branch above, which is NOT expanded-gated and so
        still renders) and a `title` tooltip that needs a fresh hover and
        isn't reliably announced by assistive tech — no reliable signal
        that they are still signed in on a shared workstation. Collapsing
        it to `sr-only` instead of unmounting it keeps it in the a11y tree
        (still announced via role="alert") without visually cluttering the
        72px collapsed rail; the reddened icon above is the persistent
        *visual* cue for a sighted mouse user who has moved away.
      */}
      {signOutFailed && (
        <p role="alert" className={cn('mt-2 px-3 text-xs text-status-danger', !expanded && 'sr-only')}>
          Sign out failed — you are still signed in. Try again.
        </p>
      )}
    </div>
  );
}
