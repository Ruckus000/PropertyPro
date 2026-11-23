import { cache } from 'react';
import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE_OPTIONS } from '@/lib/auth/cookie-config';
import { aal2SessionSubject } from '@/lib/auth/mfa';
import {
  ADMIN_ROLE_HEADER,
  ADMIN_USER_EMAIL_HEADER,
  ADMIN_USER_ID_HEADER,
  normalizeAdminHeaderValue,
} from './forwarded-headers';

export interface AdminPageSession {
  id: string;
  email: string;
  role: 'super_admin';
}

/**
 * The user id of the request's own verified `aal2` admin session, read from
 * the admin cookie independently of the headers middleware forwards. Read-only
 * cookie access: middleware owns the token refresh and has already written any
 * refreshed cookie onto this request.
 */
async function verifiedAdminSubject(): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: ADMIN_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
    },
  });
  return aal2SessionSubject(supabase);
}

const getAdminPageSessionCached = cache(async (): Promise<AdminPageSession> => {
  const requestHeaders = await headers();
  const userId = normalizeAdminHeaderValue(requestHeaders.get(ADMIN_USER_ID_HEADER));
  const email =
    normalizeAdminHeaderValue(requestHeaders.get(ADMIN_USER_EMAIL_HEADER)) ?? '';
  const role = normalizeAdminHeaderValue(requestHeaders.get(ADMIN_ROLE_HEADER));

  // A Server Component cannot set an HTTP status, so these redirect rather
  // than throw. `throw new Response(...)` used to be here — a Remix idiom the
  // App Router never unwraps, which turned every denial into an unstyled 500.
  //
  // Redirecting also matches what middleware already does for the same
  // condition, so a request that somehow reaches a page without the verified
  // headers lands on the same screen either way.
  if (!userId) {
    redirect('/auth/login');
  }

  if (role !== 'super_admin') {
    redirect('/auth/login?error=access_denied');
  }

  // Pages verify the session themselves, in addition to middleware: the
  // forwarded admin identity is used only when the request's own aal2 session
  // names the same user.
  if ((await verifiedAdminSubject()) !== userId) {
    redirect('/auth/login');
  }

  return {
    id: userId,
    email,
    role: 'super_admin',
  };
});

export async function requireAdminPageSession(): Promise<AdminPageSession> {
  return getAdminPageSessionCached();
}
