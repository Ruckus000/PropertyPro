import { jwtVerify } from 'jose';
import type { SupportSessionJwtPayload } from '@propertypro/shared';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isReadOnlyBlocked(method: string): boolean {
  return MUTATION_METHODS.has(method.toUpperCase());
}

export async function parseImpersonationCookie(
  cookieValue: string | undefined,
): Promise<SupportSessionJwtPayload | null> {
  if (!cookieValue) return null;

  const secret = process.env.SUPPORT_SESSION_JWT_SECRET;
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(
      cookieValue,
      new TextEncoder().encode(secret),
      { algorithms: ['HS256'] },
    );

    if (
      !payload.sub ||
      !payload.act ||
      typeof (payload.act as Record<string, unknown>).sub !== 'string' ||
      typeof payload.community_id !== 'number' ||
      typeof payload.session_id !== 'number' ||
      !payload.scope ||
      !['read_only', 'read_write'].includes(payload.scope as string)
    ) {
      return null;
    }

    return payload as unknown as SupportSessionJwtPayload;
  } catch {
    return null;
  }
}
