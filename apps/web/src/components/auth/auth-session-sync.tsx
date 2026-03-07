'use client';

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

      // Only act on state changes after initialization
      if (!initialSessionHandled) return;

      if (event === 'SIGNED_OUT') {
        // Full page reload to clear all cached state
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
