'use client';

/**
 * Client-side auth state synchronisation for the authenticated layout.
 *
 * Handles two runtime events that middleware cannot intercept:
 *  - SIGNED_OUT — cross-tab logout detection (another tab signed out)
 *  - TOKEN_REFRESHED / USER_UPDATED — revalidate server components
 *
 * INITIAL_SESSION is explicitly skipped because middleware has already
 * enforced auth on the initial page load. Acting on it here would
 * duplicate enforcement and risk race conditions (e.g. redirect loops
 * when the session cookie hasn't been written yet).
 */
import { useEffect } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { usePathname, useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';

function getReturnTo(pathname: string | null): string {
  return pathname && pathname.length > 0 ? pathname : '/dashboard';
}

export function AuthSessionSync() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createBrowserClient();
    let initialSessionHandled = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, _session: Session | null) => {
      // Skip the initial session event — middleware already handled auth
      if (event === 'INITIAL_SESSION') {
        initialSessionHandled = true;
        return;
      }

      // Only act on state changes after initialisation
      if (!initialSessionHandled) return;

      if (event === 'SIGNED_OUT') {
        // Full page reload to clear all cached state (React Query, context, etc.)
        window.location.href = `/auth/login?returnTo=${encodeURIComponent(getReturnTo(pathname))}`;
        return;
      }

      // TOKEN_REFRESHED, USER_UPDATED, etc. — revalidate server data
      router.refresh();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  return null;
}
