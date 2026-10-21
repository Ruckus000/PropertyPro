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
    process.env.OAUTH_STATE_SECRET = 'test-oauth-state-secret-long-enough';
    process.env.SUPPORT_SESSION_JWT_SECRET = 'test-support-jwt-secret-min-32-chars-abc';
    process.env.COMMUNITY_EMAIL_UNSUBSCRIBE_SECRET = 'test-community-unsub-secret';
    process.env.SNOWBIRD_UNSUBSCRIBE_SECRET = 'test-snowbird-unsub-secret';
    process.env.INSURANCE_ALERTS_UNSUBSCRIBE_SECRET = 'test-insurance-unsub-secret';
    // 32-char minimum, matching the floor in the route's secretRules — the
    // ingress fails CLOSED without it, so support@ stops being ingested.
    process.env.INBOUND_EMAIL_WEBHOOK_SECRET = 'test-inbound-email-webhook-secret-32ch';
    // Email must resolve to 'live' for the healthy baseline. EMAIL_DRY_RUN is
    // deleted rather than set falsy: it outranks the API key, and leaving it
    // set from another test would degrade every case in this file.
    process.env.RESEND_API_KEY = 'test-resend-key';
    delete process.env.EMAIL_DRY_RUN;
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
    process.env.OAUTH_STATE_SECRET = 'short';
    executeMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(REQUIRED_COLUMNS.map((column_name) => ({ column_name })));

    const res = await GET(request());
    const body = (await res.json()) as {
      status: string;
      checks: { oauth_state_secret: { status: string; error?: string } };
    };

    expect(body.status).toBe('degraded');
    expect(body.checks.oauth_state_secret.status).toBe('fail');
    expect(body.checks.oauth_state_secret.error).toContain('too short');
  });

  // Nothing live reads these since the access-request OTP and the fake
  // calendar/accounting connectors were deleted, so an unset one must not turn
  // readiness degraded.
  it('stays healthy without OTP_HMAC_SECRET or TOKEN_ENCRYPTION_KEY', async () => {
    delete process.env.OTP_HMAC_SECRET;
    delete process.env.TOKEN_ENCRYPTION_KEY;
    executeMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(REQUIRED_COLUMNS.map((column_name) => ({ column_name })));

    const res = await GET(request());
    const body = (await res.json()) as { status: string; checks: Record<string, unknown> };

    expect(body.status).toBe('healthy');
    expect(body.checks).not.toHaveProperty('otp_hmac_secret');
    expect(body.checks).not.toHaveProperty('token_encryption_key');
  });

  // Each of these was reachable in production with nothing reporting it. The
  // failure is never a crash — it is a 500 on one flow, or an email that goes
  // out carrying a link that cannot work. Readiness is the only place that
  // turns "unset" into a signal.
  it.each([
    ['OAUTH_STATE_SECRET', 'oauth_state_secret'],
    ['SUPPORT_SESSION_JWT_SECRET', 'support_session_jwt_secret'],
    ['COMMUNITY_EMAIL_UNSUBSCRIBE_SECRET', 'community_email_unsubscribe_secret'],
    ['SNOWBIRD_UNSUBSCRIBE_SECRET', 'snowbird_unsubscribe_secret'],
    ['INSURANCE_ALERTS_UNSUBSCRIBE_SECRET', 'insurance_alerts_unsubscribe_secret'],
    ['INBOUND_EMAIL_WEBHOOK_SECRET', 'inbound_email_webhook_secret'],
  ])('reports degraded when %s is missing', async (envName, checkKey) => {
    delete process.env[envName];
    executeMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(REQUIRED_COLUMNS.map((column_name) => ({ column_name })));

    const res = await GET(request());
    const body = (await res.json()) as {
      status: string;
      checks: Record<string, { status: string; error?: string }>;
    };

    // 200 not 503 — the app is serving traffic; a specific capability is dead.
    expect(res.status).toBe(200);
    expect(body.status).toBe('degraded');
    expect(body.checks[checkKey]?.status).toBe('fail');
    expect(body.checks[checkKey]?.error).toContain(`${envName} is not set`);
  });

  it('never reports a secret VALUE, only its length', async () => {
    // compliance_audit_log and this probe share a property: whatever they
    // record is readable by someone who is not the operator. A readiness body
    // is pasted into tickets and monitor alerts, so it must stay safe to paste.
    process.env.OAUTH_STATE_SECRET = 'super-secret-value';
    executeMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(REQUIRED_COLUMNS.map((column_name) => ({ column_name })));

    const res = await GET(request());
    const raw = JSON.stringify(await res.json());

    expect(raw).not.toContain('super-secret-value');
  });

  // The silent-email class. `sendEmail` returns successfully in both of these
  // states while transmitting nothing, so every call site reports success and
  // no verification email, invitation or statutory notice ever arrives.
  it('reports degraded when RESEND_API_KEY is unset — mail is silently discarded', async () => {
    delete process.env.RESEND_API_KEY;
    executeMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(REQUIRED_COLUMNS.map((column_name) => ({ column_name })));

    const res = await GET(request());
    const body = (await res.json()) as {
      status: string;
      checks: { email_delivery: { status: string; error?: string } };
    };

    expect(res.status).toBe(200);
    expect(body.status).toBe('degraded');
    expect(body.checks.email_delivery.status).toBe('fail');
    expect(body.checks.email_delivery.error).toContain('silently discarded');
  });

  it('reports degraded when EMAIL_DRY_RUN is set, even with a valid API key', async () => {
    // dry-run deliberately outranks a configured key. A deployed app in
    // dry-run looks completely healthy from the outside while delivering
    // nothing, so the probe has to read the resolved MODE, not the key.
    process.env.EMAIL_DRY_RUN = '1';
    executeMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(REQUIRED_COLUMNS.map((column_name) => ({ column_name })));

    const res = await GET(request());
    const body = (await res.json()) as {
      status: string;
      checks: { email_delivery: { status: string; error?: string } };
    };

    expect(body.status).toBe('degraded');
    expect(body.checks.email_delivery.status).toBe('fail');
    expect(body.checks.email_delivery.error).toContain('EMAIL_DRY_RUN');
  });

  it('treats EMAIL_DRY_RUN=false as not set', async () => {
    // Anti-vacuity for the case above: the check must follow the package's own
    // truthiness rules ('0'/'false'/'no' are falsy) rather than testing for
    // mere presence, or turning the flag off would not turn it off.
    process.env.EMAIL_DRY_RUN = 'false';
    executeMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(REQUIRED_COLUMNS.map((column_name) => ({ column_name })));

    const res = await GET(request());
    const body = (await res.json()) as {
      status: string;
      checks: { email_delivery: { status: string } };
    };

    expect(body.checks.email_delivery.status).toBe('pass');
    expect(body.status).toBe('healthy');
  });
});
