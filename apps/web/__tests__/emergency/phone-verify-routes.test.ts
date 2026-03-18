import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  createUnscopedClientMock,
  selectMock,
  fromMock,
  selectWhereMock,
  updateMock,
  setMock,
  whereMock,
  usersTable,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  createUnscopedClientMock: vi.fn(),
  selectMock: vi.fn(),
  fromMock: vi.fn(),
  selectWhereMock: vi.fn(),
  updateMock: vi.fn(),
  setMock: vi.fn(),
  whereMock: vi.fn(),
  usersTable: {
    id: Symbol('users.id'),
    otpLastSentAt: Symbol('users.otpLastSentAt'),
    otpFailedAttempts: Symbol('users.otpFailedAttempts'),
    otpLockedUntil: Symbol('users.otpLockedUntil'),
  },
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

vi.mock('@propertypro/db', () => ({
  users: usersTable,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
}));

vi.mock('@/lib/utils/phone', async () => {
  const { z } = await import('zod');
  return {
    phoneE164Schema: z.string().min(1).refine((v) => v.startsWith('+'), 'Must be E.164'),
    maskPhone: (phone: string) => `***${phone.slice(-4)}`,
  };
});

function setTwilioEnv() {
  process.env.TWILIO_ACCOUNT_SID = 'AC_test';
  process.env.TWILIO_AUTH_TOKEN = 'auth_test';
  process.env.TWILIO_VERIFY_SERVICE_SID = 'VA_test';
}

function clearTwilioEnv() {
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_VERIFY_SERVICE_SID;
}

function createJsonRequest(url: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function importSendRoute() {
  vi.resetModules();
  return import('../../src/app/api/v1/phone/verify/send/route');
}

async function importConfirmRoute() {
  vi.resetModules();
  return import('../../src/app/api/v1/phone/verify/confirm/route');
}

/** Helper to build a DB mock that returns user rows from select queries */
function mockDbClient(userRow: Record<string, unknown> = {}) {
  selectWhereMock.mockResolvedValue([userRow]);
  fromMock.mockReturnValue({ where: selectWhereMock });
  selectMock.mockReturnValue({ from: fromMock });
  updateMock.mockReturnValue({ set: setMock });
  setMock.mockReturnValue({ where: whereMock });
  whereMock.mockResolvedValue(undefined);

  createUnscopedClientMock.mockReturnValue({
    select: selectMock,
    update: updateMock,
  });
}

describe('phone verification routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-17T12:00:00.000Z'));

    setTwilioEnv();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-123');
  });

  afterEach(() => {
    clearTwilioEnv();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('rate limits repeated OTP send requests for the same user', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ sid: 'VE123' }));
    vi.stubGlobal('fetch', fetchMock);

    // First call: no prior send (otpLastSentAt is null)
    mockDbClient({ otpLastSentAt: null });
    const { POST } = await importSendRoute();

    const first = await POST(
      createJsonRequest('http://localhost:3000/api/v1/phone/verify/send', {
        phone: '+13055551234',
      }),
    );
    expect(first.status).toBe(200);

    // Second call: otpLastSentAt is now set (simulate DB returning the just-updated value)
    selectWhereMock.mockResolvedValue([{ otpLastSentAt: new Date('2026-03-17T12:00:00.000Z') }]);

    const second = await POST(
      createJsonRequest('http://localhost:3000/api/v1/phone/verify/send', {
        phone: '+13055551234',
      }),
    );

    const secondBody = await second.json() as { error: string; retryAfter: number };

    expect(second.status).toBe(429);
    expect(secondBody.error).toBe('Please wait before requesting another code');
    expect(secondBody.retryAfter).toBe(60);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('locks the user out after five failed OTP confirmation attempts', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ status: 'pending' })));
    vi.stubGlobal('fetch', fetchMock);

    // Track state across calls
    let failedAttempts = 0;
    let lockedUntil: Date | null = null;

    selectWhereMock.mockImplementation(async () => [{
      otpFailedAttempts: failedAttempts,
      otpLockedUntil: lockedUntil,
    }]);
    fromMock.mockReturnValue({ where: selectWhereMock });
    selectMock.mockReturnValue({ from: fromMock });
    updateMock.mockReturnValue({ set: setMock });
    setMock.mockImplementation((data: Record<string, unknown>) => {
      if (typeof data.otpFailedAttempts === 'number') {
        failedAttempts = data.otpFailedAttempts;
      }
      if (data.otpLockedUntil instanceof Date) {
        lockedUntil = data.otpLockedUntil;
      } else if (data.otpLockedUntil === null) {
        lockedUntil = null;
      }
      return { where: whereMock };
    });
    whereMock.mockResolvedValue(undefined);
    createUnscopedClientMock.mockReturnValue({
      select: selectMock,
      update: updateMock,
    });

    const { POST } = await importConfirmRoute();
    const requestBody = { phone: '+13055551234', code: '123456' };

    // 5 failures should trigger lockout
    for (let i = 0; i < 5; i += 1) {
      const res = await POST(
        createJsonRequest('http://localhost:3000/api/v1/phone/verify/confirm', requestBody),
      );
      expect(res.status).toBe(400);
    }

    // 6th attempt should be locked out
    const locked = await POST(
      createJsonRequest('http://localhost:3000/api/v1/phone/verify/confirm', requestBody),
    );
    const body = await locked.json() as { error: string; retryAfter: number };

    expect(locked.status).toBe(429);
    expect(body.error).toBe('Too many attempts. Try again later.');
  });

  it('clears failed-attempt tracking after a successful OTP confirmation', async () => {
    let failedAttempts = 0;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: 'pending' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'pending' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'approved' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'pending' }));
    vi.stubGlobal('fetch', fetchMock);

    selectWhereMock.mockImplementation(async () => [{
      otpFailedAttempts: failedAttempts,
      otpLockedUntil: null,
    }]);
    fromMock.mockReturnValue({ where: selectWhereMock });
    selectMock.mockReturnValue({ from: fromMock });
    updateMock.mockReturnValue({ set: setMock });
    setMock.mockImplementation((data: Record<string, unknown>) => {
      if (typeof data.otpFailedAttempts === 'number') {
        failedAttempts = data.otpFailedAttempts;
      }
      return { where: whereMock };
    });
    whereMock.mockResolvedValue(undefined);
    createUnscopedClientMock.mockReturnValue({
      select: selectMock,
      update: updateMock,
    });

    const { POST } = await importConfirmRoute();
    const requestBody = { phone: '+13055551234', code: '123456' };

    // Two failures
    const fail1 = await POST(createJsonRequest('http://localhost:3000/api/v1/phone/verify/confirm', requestBody));
    expect(fail1.status).toBe(400);
    const fail2 = await POST(createJsonRequest('http://localhost:3000/api/v1/phone/verify/confirm', requestBody));
    expect(fail2.status).toBe(400);

    // Success — should reset attempts
    const success = await POST(createJsonRequest('http://localhost:3000/api/v1/phone/verify/confirm', requestBody));
    expect(success.status).toBe(200);
    expect(failedAttempts).toBe(0); // Reset after success

    // One more failure after reset — should be 400 not 429 (counter was cleared)
    const afterSuccess = await POST(createJsonRequest('http://localhost:3000/api/v1/phone/verify/confirm', requestBody));
    expect(afterSuccess.status).toBe(400);
  });
});
