import { createHmac, timingSafeEqual } from 'node:crypto';

export interface CalendarSubscriptionTokenPayload {
  v: 1;
  scope: 'my_meetings';
  communityId: number;
  userId: string;
}

function getCalendarSubscriptionSecret(): string {
  const secret = process.env.CALENDAR_FEED_SECRET?.trim()
    || process.env.OAUTH_STATE_SECRET?.trim();

  if (!secret) {
    throw new Error('CALENDAR_FEED_SECRET or OAUTH_STATE_SECRET must be configured');
  }

  return secret;
}

function signPayload(payloadB64: string): string {
  return createHmac('sha256', getCalendarSubscriptionSecret())
    .update(payloadB64)
    .digest('base64url');
}

export function generateMyMeetingsSubscriptionToken(params: {
  communityId: number;
  userId: string;
}): string {
  const payload: CalendarSubscriptionTokenPayload = {
    v: 1,
    scope: 'my_meetings',
    communityId: params.communityId,
    userId: params.userId,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signPayload(payloadB64);
  return `${payloadB64}.${signature}`;
}

export function validateCalendarSubscriptionToken(
  token: string,
): CalendarSubscriptionTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  if (!payloadB64 || !signature) return null;

  const expectedSignature = signPayload(payloadB64);

  try {
    const signatureBuffer = Buffer.from(signature, 'base64url');
    const expectedBuffer = Buffer.from(expectedSignature, 'base64url');

    if (signatureBuffer.length !== expectedBuffer.length) {
      timingSafeEqual(expectedBuffer, expectedBuffer);
      return null;
    }

    if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return null;
    }
  } catch {
    return null;
  }

  let payload: Partial<CalendarSubscriptionTokenPayload>;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
  } catch {
    return null;
  }

  if (
    payload.v !== 1 ||
    payload.scope !== 'my_meetings' ||
    typeof payload.communityId !== 'number' ||
    !Number.isInteger(payload.communityId) ||
    payload.communityId <= 0 ||
    typeof payload.userId !== 'string' ||
    payload.userId.length === 0
  ) {
    return null;
  }

  return payload as CalendarSubscriptionTokenPayload;
}
