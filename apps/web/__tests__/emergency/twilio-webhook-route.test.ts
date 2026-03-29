import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  validateSmsWebhookSignatureMock,
  mapTwilioStatusMock,
  updateRecipientSmsStatusByIdsMock,
  createUnscopedClientMock,
  selectMock,
  fromMock,
  whereMock,
  limitMock,
  tables,
} = vi.hoisted(() => ({
  validateSmsWebhookSignatureMock: vi.fn(),
  mapTwilioStatusMock: vi.fn(),
  updateRecipientSmsStatusByIdsMock: vi.fn(),
  createUnscopedClientMock: vi.fn(),
  selectMock: vi.fn(),
  fromMock: vi.fn(),
  whereMock: vi.fn(),
  limitMock: vi.fn(),
  tables: {
    emergencyBroadcastRecipients: {
      broadcastId: Symbol('emergency_broadcast_recipients.broadcast_id'),
      communityId: Symbol('emergency_broadcast_recipients.community_id'),
      userId: Symbol('emergency_broadcast_recipients.user_id'),
      smsProviderSid: Symbol('emergency_broadcast_recipients.sms_provider_sid'),
    },
  },
}));

vi.mock('@/lib/services/sms/sms-service', () => ({
  validateSmsWebhookSignature: validateSmsWebhookSignatureMock,
}));

vi.mock('@/lib/services/sms/twilio-provider', () => ({
  mapTwilioStatus: mapTwilioStatusMock,
}));

vi.mock('@/lib/services/emergency-broadcast-service', () => ({
  updateRecipientSmsStatusByIds: updateRecipientSmsStatusByIdsMock,
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

vi.mock('@propertypro/db', () => ({
  emergencyBroadcastRecipients: tables.emergencyBroadcastRecipients,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
}));

import { POST } from '../../src/app/api/v1/webhooks/twilio/route';

function createWebhookRequest(
  url: string,
  fields: Record<string, string>,
  signature = 'test-signature',
): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature,
    },
    body: new URLSearchParams(fields).toString(),
  });
}

describe('Twilio webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    selectMock.mockReturnValue({ from: fromMock });
    fromMock.mockReturnValue({ where: whereMock });
    whereMock.mockReturnValue({ limit: limitMock });
    createUnscopedClientMock.mockReturnValue({ select: selectMock });

    validateSmsWebhookSignatureMock.mockReturnValue(true);
    mapTwilioStatusMock.mockReturnValue('delivered');
    updateRecipientSmsStatusByIdsMock.mockResolvedValue(undefined);
    limitMock.mockResolvedValue([
      { broadcastId: 11, communityId: 42, userId: 'user-123' },
    ]);
  });

  it('reconstructs the Twilio signature URL from origin and pathname only', async () => {
    const req = createWebhookRequest(
      'https://getpropertypro.com/api/v1/webhooks/twilio?foo=bar',
      {
        MessageSid: 'SM123',
        MessageStatus: 'delivered',
      },
    );

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(validateSmsWebhookSignatureMock).toHaveBeenCalledWith(
      'test-signature',
      'https://getpropertypro.com/api/v1/webhooks/twilio',
      {
        MessageSid: 'SM123',
        MessageStatus: 'delivered',
      },
    );
  });

  it('returns 400 when required Twilio fields are missing', async () => {
    const req = createWebhookRequest('https://getpropertypro.com/api/v1/webhooks/twilio', {
      MessageSid: 'SM123',
    });

    const res = await POST(req);
    const body = await res.json() as { error: string };

    expect(res.status).toBe(400);
    expect(body.error).toBe('Missing required fields');
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('logs and acknowledges unknown message SIDs', async () => {
    limitMock.mockResolvedValue([]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const req = createWebhookRequest('https://getpropertypro.com/api/v1/webhooks/twilio', {
      MessageSid: 'SM404',
      MessageStatus: 'failed',
    });

    const res = await POST(req);
    const body = await res.json() as { received: boolean };

    expect(res.status).toBe(200);
    expect(body.received).toBe(true);
    expect(updateRecipientSmsStatusByIdsMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[twilio-webhook] Received status callback for unknown MessageSid:',
      { messageSid: 'SM404', messageStatus: 'failed' },
    );

    warnSpy.mockRestore();
  });

  it('returns 500 so Twilio can retry unexpected processing failures', async () => {
    updateRecipientSmsStatusByIdsMock.mockRejectedValue(new Error('db write failed'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const req = createWebhookRequest('https://getpropertypro.com/api/v1/webhooks/twilio', {
      MessageSid: 'SM123',
      MessageStatus: 'delivered',
    });

    const res = await POST(req);
    const body = await res.json() as { error: string };

    expect(res.status).toBe(500);
    expect(body.error).toBe('Internal error');
    expect(errorSpy).toHaveBeenCalledWith(
      '[twilio-webhook] Error processing webhook:',
      expect.any(Error),
    );

    errorSpy.mockRestore();
  });
});
