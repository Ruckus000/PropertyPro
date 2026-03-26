import { jwtVerify } from 'jose';
import {
  type SupportAccessLevel,
  SUPPORT_SESSION_DEV_SECRET,
  type SupportSessionJwtPayload,
} from '@propertypro/shared';
import { createAdminClient } from '@propertypro/db/supabase/admin';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isReadOnlyBlocked(method: string): boolean {
  return MUTATION_METHODS.has(method.toUpperCase());
}

interface ActiveSupportSessionRow {
  id: number;
  target_user_id: string;
  community_id: number;
  access_level: SupportAccessLevel;
  ended_at: string | null;
  expires_at: string;
}

interface ResolveActiveSupportSessionOptions {
  expectedCommunityId?: number | null;
}

export function matchesActiveSupportSession(
  payload: SupportSessionJwtPayload,
  session: ActiveSupportSessionRow,
  now: number = Date.now(),
): boolean {
  const expiresAt = Date.parse(session.expires_at);

  return !(
    session.target_user_id !== payload.sub ||
    session.community_id !== payload.community_id ||
    session.access_level !== payload.scope ||
    session.ended_at !== null ||
    Number.isNaN(expiresAt) ||
    expiresAt <= now
  );
}

export async function parseImpersonationCookie(
  cookieValue: string | undefined,
): Promise<SupportSessionJwtPayload | null> {
  if (!cookieValue) return null;

  const secret = process.env.SUPPORT_SESSION_JWT_SECRET;
  const effectiveSecret =
    secret && secret.length >= 32
      ? secret
      : process.env.NODE_ENV !== 'production'
        ? SUPPORT_SESSION_DEV_SECRET
        : null;

  if (!effectiveSecret) return null;

  try {
    const { payload } = await jwtVerify(
      cookieValue,
      new TextEncoder().encode(effectiveSecret),
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

export async function resolveActiveSupportSession(
  cookieValue: string | undefined,
  options: ResolveActiveSupportSessionOptions = {},
): Promise<SupportSessionJwtPayload | null> {
  const payload = await parseImpersonationCookie(cookieValue);
  if (!payload) return null;

  if (
    options.expectedCommunityId != null &&
    payload.community_id !== options.expectedCommunityId
  ) {
    return null;
  }

  try {
    // Authorization contract: middleware calls this only after validating the
    // signed support cookie and uses the service-role read solely to confirm
    // the referenced support session is still active.
    const db = createAdminClient();
    const { data, error } = await db
      .from('support_sessions')
      .select(
        'id, target_user_id, community_id, access_level, ended_at, expires_at',
      )
      .eq('id', payload.session_id)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const session = data as unknown as ActiveSupportSessionRow;
    if (!matchesActiveSupportSession(payload, session)) {
      return null;
    }

    return payload;
  } catch (error) {
    console.error('[support] Failed to validate support session:', error);
    return null;
  }
}
