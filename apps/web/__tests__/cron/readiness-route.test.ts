import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { executeMock, limitMock, listUsersMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  limitMock: vi.fn(),
  listUsersMock: vi.fn(),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => ({
    execute: executeMock,
    select: () => ({
      from: () => ({
        where: () => ({
          limit: limitMock,
        }),
      }),
    }),
  }),
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        listUsers: listUsersMock,
      },
    },
  }),
}));

vi.mock('@propertypro/db', () => ({
  stripePrices: {
    id: 'stripe_prices.id',
    planId: 'stripe_prices.plan_id',
    communityType: 'stripe_prices.community_type',
    billingInterval: 'stripe_prices.billing_interval',
  },
}));

vi.mock('@propertypro/db/filters', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));

vi.mock('@/lib/auth/signup-schema', () => ({
  SIGNUP_PLAN_OPTIONS: {
    condo_718: [{ id: 'essentials' }],
  },
}));

import { GET } from '../../src/app/api/v1/internal/readiness/route';

const URL = 'http://localhost:3000/api/v1/internal/readiness';
const REQUIRED_COLUMNS = [
  'address_line_1',
  'city',
  'state',
  'zip_code',
];

function request(): NextRequest {
  return new NextRequest(URL, {
    headers: { authorization: 'Bearer test-secret' },
  });
}

describe('readiness route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.READINESS_CHECK_SECRET = 'test-secret';
    process.env.REAUTH_JWT_SECRET = 'test-reauth-secret-min-32-chars-xyzabc';
    // Readiness now also reports on the secrets whose absence fails silently in
    // production (the cron outage was invisible precisely because nothing
    // checked CRON_SECRET). Set them so the baseline is 'healthy'; the
    // missing-secret behaviour has its own test below.
    process.env.CRON_SECRET = 'test-cron-secret-long-enough';
    process.env.OTP_HMAC_SECRET = 'test-otp-secret-long-enough';
    process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
    limitMock.mockResolvedValue([{ id: 1 }]);
    listUsersMock.mockResolvedValue({ data: { users: [] }, error: null });
  });

  it('passes schema compatibility when pending_signups structured-address columns exist', async () => {
    executeMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(REQUIRED_COLUMNS.map((column_name) => ({ column_name })));

    const res = await GET(request());
    const body = await res.json() as {
      status: string;
      checks: { schema_compatibility: { status: string } };
    };

    expect(res.status).toBe(200);
    expect(body.status).toBe('healthy');
    expect(body.checks.schema_compatibility.status).toBe('pass');
  });

  it('fails readiness when pending_signups structured-address columns are missing', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    executeMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ column_name: 'city' }]);

    const res = await GET(request());
    const body = await res.json() as {
      status: string;
      checks: { schema_compatibility: { status: string; missing: string[] } };
    };

    expect(res.status).toBe(503);
    expect(body.status).toBe('unhealthy');
    expect(body.checks.schema_compatibility).toEqual({
      status: 'fail',
      missing: [
        'pending_signups.address_line_1',
        'pending_signups.state',
        'pending_signups.zip_code',
      ],
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(
      'readiness.schema_compatibility_failed',
    ));

    consoleErrorSpy.mockRestore();
  });

  it('reports degraded when CRON_SECRET is missing', async () => {
    // The regression this locks down: CRON_SECRET was unset in production for
    // months, every Vercel cron 401'd, and NOTHING surfaced it — the platform
    // still listed all 10 jobs as registered and firing. Readiness is now the
    // signal that would have caught it on day one.
    delete process.env.CRON_SECRET;
    executeMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(REQUIRED_COLUMNS.map((column_name) => ({ column_name })));

    const res = await GET(request());
    const body = (await res.json()) as {
      status: string;
      checks: { cron_secret: { status: string; error?: string } };
    };

    // 200, not 503: the app is serving traffic fine. It is the scheduled work
    // that is silently dead, which is 'degraded'.
    expect(res.status).toBe(200);
    expect(body.status).toBe('degraded');
    expect(body.checks.cron_secret.status).toBe('fail');
    expect(body.checks.cron_secret.error).toContain('CRON_SECRET is not set');
  });

  it('reports degraded when a load-bearing secret is too short to be real', async () => {
    process.env.OTP_HMAC_SECRET = 'short';
    executeMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(REQUIRED_COLUMNS.map((column_name) => ({ column_name })));

    const res = await GET(request());
    const body = (await res.json()) as {
      status: string;
      checks: { otp_hmac_secret: { status: string; error?: string } };
    };

    expect(body.status).toBe('degraded');
    expect(body.checks.otp_hmac_secret.status).toBe('fail');
    expect(body.checks.otp_hmac_secret.error).toContain('too short');
  });

  // TOKEN_ENCRYPTION_KEY needs a FORMAT check, not a length floor.
  // `parseTokenEncryptionKeyHex` requires exactly 64 hex characters, so both
  // cases below throw on every encrypt and decrypt — while a `length >= 64`
  // test called them healthy. A green probe over a permanently broken
  // encryption path is the worst outcome this endpoint can produce, because it
  // actively certifies the fault as fine.
  it.each([
    [
      'a 128-char key from `openssl rand -hex 64` (the arg is BYTES, not chars)',
      'a'.repeat(128),
    ],
    ['a 64-char passphrase that is not hex', 'z'.repeat(64)],
  ])('reports degraded for TOKEN_ENCRYPTION_KEY set to %s', async (_label, value) => {
    process.env.TOKEN_ENCRYPTION_KEY = value;
    executeMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(REQUIRED_COLUMNS.map((column_name) => ({ column_name })));

    const res = await GET(request());
    const body = (await res.json()) as {
      status: string;
      checks: { token_encryption_key: { status: string; error?: string } };
    };

    expect(body.status).toBe('degraded');
    expect(body.checks.token_encryption_key.status).toBe('fail');
    expect(body.checks.token_encryption_key.error).toContain('exactly 64 hex characters');
  });

  it('still passes TOKEN_ENCRYPTION_KEY for a real 64-char hex key', async () => {
    // Anti-vacuity for the two cases above: the new format check must not
    // reject the value operators are told to generate.
    process.env.TOKEN_ENCRYPTION_KEY = '0123456789abcdefABCDEF0123456789abcdefABCDEF01234567890123456789';
    executeMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(REQUIRED_COLUMNS.map((column_name) => ({ column_name })));

    const res = await GET(request());
    const body = (await res.json()) as {
      status: string;
      checks: { token_encryption_key: { status: string } };
    };

    expect(body.checks.token_encryption_key.status).toBe('pass');
    expect(body.status).toBe('healthy');
  });
});
