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
});
