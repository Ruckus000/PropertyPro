'use client';

import { useEffect } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { usePathname, useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';

const VERIFY_EMAIL_PATH = '/auth/verify-email';

function getReturnTo(pathname: string | null): string {
  return pathname && pathname.length > 0 ? pathname : '/dashboard';
}

export function AuthSessionSync() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createBrowserClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (!session?.user) {
        const returnTo = encodeURIComponent(getReturnTo(pathname));
        router.replace(`/auth/login?returnTo=${returnTo}`);
        return;
      }

      if (!session.user.email_confirmed_at) {
        const returnTo = encodeURIComponent(getReturnTo(pathname));
        router.replace(`${VERIFY_EMAIL_PATH}?returnTo=${returnTo}`);
        return;
      }

      router.refresh();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  return null;
}
