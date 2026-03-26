import { cache } from 'react';
import { headers } from 'next/headers';
import { UnauthorizedError } from '@/lib/api/errors';
import {
  normalizeForwardedHeaderValue,
  USER_EMAIL_HEADER,
  USER_FULL_NAME_HEADER,
  USER_ID_HEADER,
  USER_PHONE_HEADER,
} from './forwarded-headers';

export interface PageAuthenticatedUser {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string | null;
  user_metadata: {
    full_name?: string;
  };
}

const getOptionalPageAuthenticatedUserCached = cache(
  async (): Promise<PageAuthenticatedUser | null> => {
    const requestHeaders = await headers();
    const userId = normalizeForwardedHeaderValue(requestHeaders.get(USER_ID_HEADER));

    if (!userId) {
      return null;
    }

    const email = normalizeForwardedHeaderValue(requestHeaders.get(USER_EMAIL_HEADER));
    const fullName = normalizeForwardedHeaderValue(
      requestHeaders.get(USER_FULL_NAME_HEADER),
    );
    const phone = normalizeForwardedHeaderValue(requestHeaders.get(USER_PHONE_HEADER));

    return {
      id: userId,
      email,
      phone,
      fullName,
      user_metadata: fullName ? { full_name: fullName } : {},
    };
  },
);

export async function getOptionalPageAuthenticatedUser(): Promise<PageAuthenticatedUser | null> {
  return getOptionalPageAuthenticatedUserCached();
}

export async function requirePageAuthenticatedUser(): Promise<PageAuthenticatedUser> {
  const user = await getOptionalPageAuthenticatedUserCached();
  if (!user) {
    throw new UnauthorizedError();
  }
  return user;
}

export async function requirePageAuthenticatedUserId(): Promise<string> {
  const user = await requirePageAuthenticatedUser();
  return user.id;
}
