'use client';

/**
 * Client-side auth state synchronisation for the authenticated layout.
 *
 * Handles two runtime events that middleware cannot intercept:
 *  - SIGNED_OUT — cross-tab logout detection (another tab signed out)
 *  - USER_UPDATED, SIGNED_IN, etc. — revalidate server components
 *
 * TOKEN_REFRESHED is ignored: a refresh keeps the same identity, and
 * middleware refreshes the server's cookies itself. Refreshing the router on
 * it re-rendered the whole tree about hourly and emptied the client router
 * cache for nothing.
 *
 * SIGNED_IN refreshes only when the user id differs from the last one seen.
 * supabase-js re-emits SIGNED_IN with the SAME session every time the tab
 * becomes visible (`_recoverAndRefresh`, called from its visibilitychange
 * handler), so refreshing on every SIGNED_IN re-rendered the page on the
 * server and emptied the router cache each time a user came back to the tab.
 * A different id is a real cross-tab sign-in as someone else.
 *
 * INITIAL_SESSION is explicitly skipped because middleware has already
 * enforced auth on the initial page load. Acting on it here would
 * duplicate enforcement and risk race conditions (e.g. redirect loops
 * when the session cookie hasn't been written yet).
 */
import { useEffect, useRef } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { usePathname, useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';

function getReturnTo(pathname: string | null): string {
  return pathname && pathname.length > 0 ? pathname : '/dashboard';
}

export function AuthSessionSync() {
  const router = useRouter();
  const pathname = usePathname();
  // Read through a ref so a navigation does not tear down and re-create the
  // auth subscription; only the sign-out redirect needs the current path.
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    const supabase = createBrowserClient();
    let initialSessionHandled = false;
    let lastUserId: string | null = null;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      const previousUserId = lastUserId;
      lastUserId = session?.user.id ?? null;

      // Skip the initial session event — middleware already handled auth
      if (event === 'INITIAL_SESSION') {
        initialSessionHandled = true;
        return;
      }

      // Only act on state changes after initialisation
      if (!initialSessionHandled) return;

      if (event === 'SIGNED_OUT') {
        // Full page reload to clear all cached state (React Query, context, etc.)
        window.location.href = `/auth/login?returnTo=${encodeURIComponent(getReturnTo(pathnameRef.current))}`;
        return;
      }

      if (event === 'TOKEN_REFRESHED') return;

      // Same-user SIGNED_IN is supabase-js re-announcing on tab focus.
      if (event === 'SIGNED_IN' && session?.user.id === previousUserId) return;

      // USER_UPDATED, a different user's SIGNED_IN, etc. — revalidate server data
      router.refresh();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  return null;
}
