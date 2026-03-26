import { cache } from 'react';
import { headers } from 'next/headers';
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

  if (!userId) {
    throw new Response('Unauthorized', { status: 401 });
  }

  if (role !== 'super_admin') {
    throw new Response('Forbidden', { status: 403 });
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
