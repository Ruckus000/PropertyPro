import { describe, expect, it } from 'vitest';

const hasGoogleContractEnv =
  typeof process.env.GOOGLE_CALENDAR_CLIENT_ID === 'string'
  && process.env.GOOGLE_CALENDAR_CLIENT_ID.length > 0
  && typeof process.env.GOOGLE_CALENDAR_CLIENT_SECRET === 'string'
  && process.env.GOOGLE_CALENDAR_CLIENT_SECRET.length > 0;

const hasQuickBooksContractEnv =
  typeof process.env.QUICKBOOKS_CLIENT_ID === 'string'
  && process.env.QUICKBOOKS_CLIENT_ID.length > 0
  && typeof process.env.QUICKBOOKS_CLIENT_SECRET === 'string'
  && process.env.QUICKBOOKS_CLIENT_SECRET.length > 0;

const hasXeroContractEnv =
  typeof process.env.XERO_CLIENT_ID === 'string'
  && process.env.XERO_CLIENT_ID.length > 0
  && typeof process.env.XERO_CLIENT_SECRET === 'string'
  && process.env.XERO_CLIENT_SECRET.length > 0;

const describeGoogleContract = hasGoogleContractEnv ? describe : describe.skip;
const describeQuickBooksContract = hasQuickBooksContractEnv ? describe : describe.skip;
const describeXeroContract = hasXeroContractEnv ? describe : describe.skip;

describeGoogleContract('WS70 Google Calendar contract scaffold', () => {
  it('hits Google OAuth token endpoint with configured credentials', async () => {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID as string,
        client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET as string,
        grant_type: 'authorization_code',
        code: 'invalid-contract-code',
        redirect_uri: 'https://localhost.invalid/api/v1/calendar/google/callback',
      }),
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });
});

describeQuickBooksContract('WS70 QuickBooks contract scaffold', () => {
  it('hits QuickBooks OAuth token endpoint with configured credentials', async () => {
    const basicAuth = Buffer.from(
      `${process.env.QUICKBOOKS_CLIENT_ID}:${process.env.QUICKBOOKS_CLIENT_SECRET}`,
    ).toString('base64');

    const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        authorization: `Basic ${basicAuth}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: 'invalid-contract-code',
        redirect_uri: 'https://localhost.invalid/api/v1/accounting/callback',
      }),
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });
});

describeXeroContract('WS70 Xero contract scaffold', () => {
  it('hits Xero OAuth token endpoint with configured credentials', async () => {
    const basicAuth = Buffer.from(
      `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`,
    ).toString('base64');

    const response = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        authorization: `Basic ${basicAuth}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: 'invalid-contract-code',
        redirect_uri: 'https://localhost.invalid/api/v1/accounting/callback',
      }),
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });
});
