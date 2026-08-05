import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
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

  return {
    id: userId,
    email,
    role: 'super_admin',
  };
});

export async function requireAdminPageSession(): Promise<AdminPageSession> {
  return getAdminPageSessionCached();
}
