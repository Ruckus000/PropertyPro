import type { IcsMeetingInput } from './ics';

export interface GoogleCalendarTokenExchange {
  accessToken: string;
  refreshToken: string;
  syncToken: string;
  channelId: string;
  channelExpiry: Date;
}

export interface GoogleSyncResult {
  syncedCount: number;
  syncToken: string;
  channelId: string;
  channelExpiry: Date;
}

function stableHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function deterministicToken(prefix: string, seed: string): string {
  return `${prefix}_${stableHash(seed)}`;
}

export const deterministicGoogleCalendarAdapter = {
  buildConnectUrl(params: {
    communityId: number;
    userId: string;
    state: string;
    redirectUri: string;
  }): string {
    const url = new URL('https://oauth.google.example/connect');
    url.searchParams.set('state', params.state);
    url.searchParams.set('communityId', String(params.communityId));
    url.searchParams.set('userId', params.userId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    return url.toString();
  },

  async exchangeCodeForTokens(params: {
    code: string;
    redirectUri: string;
  }): Promise<GoogleCalendarTokenExchange> {
    const seed = `${params.code}:${params.redirectUri}`;
    return {
      accessToken: deterministicToken('google_access', seed),
      refreshToken: deterministicToken('google_refresh', seed),
      syncToken: deterministicToken('google_sync', seed),
      channelId: deterministicToken('google_channel', seed),
      channelExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };
  },

  async syncMeetings(params: {
    accessToken: string;
    refreshToken: string;
    meetings: readonly IcsMeetingInput[];
    previousSyncToken?: string | null;
  }): Promise<GoogleSyncResult> {
    const seed = [
      params.accessToken,
      params.refreshToken,
      String(params.meetings.length),
      params.previousSyncToken ?? 'initial',
    ].join(':');

    return {
      syncedCount: params.meetings.length,
      syncToken: deterministicToken('google_sync', seed),
      channelId: deterministicToken('google_channel', seed),
      channelExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };
  },

  async disconnect(): Promise<void> {
    return;
  },
};
