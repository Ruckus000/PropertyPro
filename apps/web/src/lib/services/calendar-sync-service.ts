import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  calendarSyncTokens,
  createScopedClient,
  decryptToken,
  encryptToken,
  logAuditEvent,
  meetings,
  type CalendarSyncProvider,
} from '@propertypro/db';
import { and, asc, eq } from '@propertypro/db/filters';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/lib/api/errors';
import { deterministicGoogleCalendarAdapter } from '@/lib/calendar/google-calendar-adapter';
import { buildMeetingsIcs, type IcsMeetingInput } from '@/lib/calendar/ics';

interface CalendarSyncTokenRow {
  [key: string]: unknown;
  id: number;
  communityId: number;
  userId: string;
  provider: CalendarSyncProvider;
  accessToken: string;
  refreshToken: string;
  syncToken: string | null;
  channelId: string | null;
  channelExpiry: Date | null;
  lastSyncAt: Date | null;
}

interface MeetingRow {
  [key: string]: unknown;
  id: number;
  title: string;
  meetingType: string;
  startsAt: Date;
  location: string;
}

function getCalendarCallbackUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) {
    return `${appUrl.replace(/\/$/, '')}/api/v1/calendar/google/callback`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}/api/v1/calendar/google/callback`;
  }

  return 'http://localhost:3000/api/v1/calendar/google/callback';
}

// ---------------------------------------------------------------------------
// HMAC helpers — sign OAuth state to prevent forgery (per Google / Intuit / Xero guidance)
// ---------------------------------------------------------------------------

function getStateSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!secret) throw new Error('OAUTH_STATE_SECRET is not configured');
  return secret;
}

export function signPayload(payload: string): string {
  return createHmac('sha256', getStateSecret())
    .update(payload)
    .digest('base64url');
}

export function verifySignature(payload: string, signature: string): boolean {
  const expected = signPayload(payload);
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

function serializeState(communityId: number, userId: string): string {
  const payload = JSON.stringify({ communityId, userId, ts: Date.now() });
  const sig = signPayload(payload);
  return Buffer.from(JSON.stringify({ p: payload, s: sig })).toString('base64url');
}

const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

export function validateOAuthState(
  stateParam: string | null,
  expectedCommunityId: number,
  expectedUserId: string,
): void {
  if (!stateParam) {
    throw new BadRequestError('Missing OAuth state parameter');
  }

  let outer: { p: string; s: string };
  try {
    outer = JSON.parse(Buffer.from(stateParam, 'base64url').toString());
  } catch {
    throw new BadRequestError('Invalid OAuth state parameter');
  }

  if (!outer.p || !outer.s || !verifySignature(outer.p, outer.s)) {
    throw new ForbiddenError('OAuth state signature invalid');
  }

  let parsed: { communityId: number; userId: string; ts: number };
  try {
    parsed = JSON.parse(outer.p);
  } catch {
    throw new BadRequestError('Invalid OAuth state payload');
  }

  if (parsed.communityId !== expectedCommunityId || parsed.userId !== expectedUserId) {
    throw new ForbiddenError('OAuth state mismatch');
  }
  if (Date.now() - parsed.ts > STATE_MAX_AGE_MS) {
    throw new BadRequestError('OAuth state expired');
  }
}

async function listCommunityMeetings(
  communityId: number,
): Promise<IcsMeetingInput[]> {
  const scoped = createScopedClient(communityId);

  const rows = await scoped
    .selectFrom<MeetingRow>(meetings, {}, undefined)
    .orderBy(asc(meetings.startsAt), asc(meetings.id));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    meetingType: row.meetingType,
    startsAt: row.startsAt,
    location: row.location,
  }));
}

async function getGoogleConnection(
  communityId: number,
  actorUserId: string,
): Promise<CalendarSyncTokenRow | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<CalendarSyncTokenRow>(
    calendarSyncTokens,
    {},
    and(
      eq(calendarSyncTokens.userId, actorUserId),
      eq(calendarSyncTokens.provider, 'google'),
    ),
  );
  return rows[0] ?? null;
}

export async function generateCommunityMeetingsIcs(
  communityId: number,
  calendarName?: string,
): Promise<string> {
  const meetingsForCalendar = await listCommunityMeetings(communityId);
  return buildMeetingsIcs(meetingsForCalendar, {
    calendarName,
  });
}

export async function generateMyMeetingsIcs(
  communityId: number,
  actorUserId: string,
): Promise<string> {
  const meetingsForCalendar = await listCommunityMeetings(communityId);
  return buildMeetingsIcs(meetingsForCalendar, {
    calendarName: `PropertyPro Meetings (${actorUserId.slice(0, 8)})`,
  });
}

export async function initiateGoogleCalendarConnect(
  communityId: number,
  actorUserId: string,
): Promise<{ authorizationUrl: string; state: string }> {
  const state = serializeState(communityId, actorUserId);
  const authorizationUrl = deterministicGoogleCalendarAdapter.buildConnectUrl({
    communityId,
    userId: actorUserId,
    state,
    redirectUri: getCalendarCallbackUrl(),
  });

  return {
    authorizationUrl,
    state,
  };
}

export async function completeGoogleCalendarConnect(
  communityId: number,
  actorUserId: string,
  code: string,
  requestId?: string | null,
): Promise<{
  provider: 'google';
  userId: string;
  syncedAt: string | null;
}> {
  const scoped = createScopedClient(communityId);
  const tokenPayload = await deterministicGoogleCalendarAdapter.exchangeCodeForTokens({
    code,
    redirectUri: getCalendarCallbackUrl(),
  });

  const existing = await getGoogleConnection(communityId, actorUserId);

  const accessToken = encryptToken(tokenPayload.accessToken);
  const refreshToken = encryptToken(tokenPayload.refreshToken);

  if (existing) {
    await scoped.update(
      calendarSyncTokens,
      {
        accessToken,
        refreshToken,
        syncToken: tokenPayload.syncToken,
        channelId: tokenPayload.channelId,
        channelExpiry: tokenPayload.channelExpiry,
        lastSyncAt: new Date(),
      },
      eq(calendarSyncTokens.id, existing.id),
    );

    await logAuditEvent({
      userId: actorUserId,
      action: 'update',
      resourceType: 'calendar_sync_token',
      resourceId: String(existing.id),
      communityId,
      metadata: {
        requestId: requestId ?? null,
        provider: 'google',
      },
    });

    return {
      provider: 'google',
      userId: actorUserId,
      syncedAt: new Date().toISOString(),
    };
  }

  const [created] = await scoped.insert(calendarSyncTokens, {
    userId: actorUserId,
    provider: 'google',
    accessToken,
    refreshToken,
    syncToken: tokenPayload.syncToken,
    channelId: tokenPayload.channelId,
    channelExpiry: tokenPayload.channelExpiry,
    lastSyncAt: new Date(),
  });

  const createdId = created?.['id'];
  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'calendar_sync_token',
    resourceId: typeof createdId === 'number' ? String(createdId) : 'unknown',
    communityId,
    metadata: {
      requestId: requestId ?? null,
      provider: 'google',
    },
  });

  return {
    provider: 'google',
    userId: actorUserId,
    syncedAt: new Date().toISOString(),
  };
}

export async function syncGoogleCalendar(
  communityId: number,
  actorUserId: string,
  requestId?: string | null,
): Promise<{
  syncedCount: number;
  syncedAt: string;
  syncToken: string;
}> {
  const scoped = createScopedClient(communityId);
  const existing = await getGoogleConnection(communityId, actorUserId);
  if (!existing) {
    throw new NotFoundError('Google calendar is not connected for this user');
  }

  const meetingsForCalendar = await listCommunityMeetings(communityId);

  const syncResult = await deterministicGoogleCalendarAdapter.syncMeetings({
    accessToken: decryptToken(existing.accessToken),
    refreshToken: decryptToken(existing.refreshToken),
    meetings: meetingsForCalendar,
    previousSyncToken: existing.syncToken,
  });

  const syncedAt = new Date();
  await scoped.update(
    calendarSyncTokens,
    {
      syncToken: syncResult.syncToken,
      channelId: syncResult.channelId,
      channelExpiry: syncResult.channelExpiry,
      lastSyncAt: syncedAt,
    },
    eq(calendarSyncTokens.id, existing.id),
  );

  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'calendar_sync_token',
    resourceId: String(existing.id),
    communityId,
    metadata: {
      requestId: requestId ?? null,
      provider: 'google',
      syncedCount: syncResult.syncedCount,
    },
  });

  return {
    syncedCount: syncResult.syncedCount,
    syncedAt: syncedAt.toISOString(),
    syncToken: syncResult.syncToken,
  };
}

export async function disconnectGoogleCalendar(
  communityId: number,
  actorUserId: string,
  requestId?: string | null,
): Promise<{ disconnected: boolean }> {
  const scoped = createScopedClient(communityId);
  const existing = await getGoogleConnection(communityId, actorUserId);

  if (!existing) {
    return { disconnected: true };
  }

  await deterministicGoogleCalendarAdapter.disconnect();

  await scoped.hardDelete(
    calendarSyncTokens,
    eq(calendarSyncTokens.id, existing.id),
  );

  await logAuditEvent({
    userId: actorUserId,
    action: 'delete',
    resourceType: 'calendar_sync_token',
    resourceId: String(existing.id),
    communityId,
    metadata: {
      requestId: requestId ?? null,
      provider: 'google',
    },
  });

  return { disconnected: true };
}
