/**
 * Sentry event scrubbing.
 *
 * This exists because of a real, live gap: the inbound-email webhook calls
 * Sentry.captureException on a persist failure, and drizzle-orm builds its
 * error message as `Failed query: <sql>\nparams: <bound values>`. For a
 * support-inbox insert those bound values ARE the sender's address, subject
 * and full message body — third-party email content, shipped to a service
 * that retains it for 30-90 days.
 */
import { describe, expect, it } from 'vitest';

import { scrubServerEvent } from '@propertypro/shared/observability';

function drizzleEvent(value: string) {
  return { exception: { values: [{ type: 'DrizzleQueryError', value }] } } as never;
}

describe('scrubServerEvent', () => {
  it('drops the bound params from a failed query, keeping the SQL', () => {
    const event = drizzleEvent(
      'Failed query: insert into "support_inbox_messages" ("from_email","text_body") values ($1,$2)\n' +
        'params: jane@example.com,Please delete my records — account 4471',
    );

    const scrubbed = scrubServerEvent(event) as unknown as {
      exception: { values: { value: string }[] };
    };
    const out = scrubbed.exception.values[0]!.value;

    // The payload that must never leave the process.
    expect(out).not.toContain('jane@example.com');
    expect(out).not.toContain('Please delete my records');
    expect(out).not.toContain('4471');
    // The half that makes the report worth having stays.
    expect(out).toContain('Failed query: insert into "support_inbox_messages"');
    expect(out).toContain('params: [redacted]');
  });

  it('drops the params that ride along in a console BREADCRUMB', () => {
    // The channel the first version missed entirely. consoleIntegration is a
    // Sentry default, so console.error(msg, err) becomes a breadcrumb whose
    // data.arguments holds the raw Error — and Sentry spreads its own
    // enumerable properties, which for DrizzleQueryError include `params`.
    // Scrubbing exception.values alone left the values on the SAME event.
    const event = {
      breadcrumbs: [
        {
          category: 'console',
          message:
            'Unhandled error: Failed query: insert into "support_inbox_messages"\n' +
            'params: jane@example.com,Please delete my records',
          data: {
            arguments: [
              'Unhandled error:',
              { query: 'insert into ...', params: ['jane@example.com', 'Please delete my records'] },
            ],
          },
        },
      ],
    } as never;

    const out = JSON.stringify(scrubServerEvent(event));

    expect(out).not.toContain('jane@example.com');
    expect(out).not.toContain('Please delete my records');
    expect(out).toContain('params: [redacted]');
  });

  it('leaves an ordinary error untouched (control)', () => {
    const event = drizzleEvent('TypeError: cannot read properties of undefined');

    const scrubbed = scrubServerEvent(event) as unknown as {
      exception: { values: { value: string }[] };
    };

    expect(scrubbed.exception.values[0]!.value).toBe(
      'TypeError: cannot read properties of undefined',
    );
  });

  it('still redacts the headers it always did', () => {
    const event = {
      request: {
        headers: { authorization: 'Bearer secret', cookie: 'sb=1', 'x-api-key': 'k', accept: '*/*' },
      },
    } as never;

    const scrubbed = scrubServerEvent(event) as unknown as {
      request: { headers: Record<string, string> };
    };

    expect(scrubbed.request.headers['authorization']).toBeUndefined();
    expect(scrubbed.request.headers['cookie']).toBeUndefined();
    expect(scrubbed.request.headers['x-api-key']).toBeUndefined();
    expect(scrubbed.request.headers['accept']).toBe('*/*');
  });

  it('drops the captured request BODY, which carries a plaintext password', () => {
    // Shape of a real server-action POST: `updatePasswordAction(newPassword)`
    // in apps/web/src/lib/auth/actions.ts. Next's action-handler runs
    // `pipeline(req.body, ...)`, which pipes, and `Readable.pipe` attaches the
    // `'data'` listener that @sentry/node-core proxies to buffer the body.
    const event = {
      request: {
        url: 'https://app.example.com/reset-password',
        headers: { accept: '*/*' },
        data: '1:["$K1","hunter2-my-new-password"]',
      },
    } as never;

    const scrubbed = scrubServerEvent(event) as unknown as {
      request: { url: string; headers: Record<string, string>; data?: unknown };
    };

    expect(scrubbed.request.data).toBeUndefined();
    expect('data' in scrubbed.request).toBe(false);
    // Control: the rest of `request` still survives, so this is not a
    // blanket delete of the request object.
    expect(scrubbed.request.url).toBe('https://app.example.com/reset-password');
    expect(scrubbed.request.headers['accept']).toBe('*/*');
  });

  it('handles an event with no exception and no request', () => {
    expect(() => scrubServerEvent({} as never)).not.toThrow();
  });
});
