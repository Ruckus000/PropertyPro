/**
 * Delivery-mode gate for outbound mail.
 *
 * The case that matters: `scripts/with-env-local.sh` points DATABASE_URL at
 * PRODUCTION while `.env.local` also carries a live RESEND_API_KEY. Before
 * EMAIL_DRY_RUN existed, any ops script run that way mailed real customers.
 * These tests pin that a dry run transmits nothing even with a valid key
 * present, and that it says so out loud rather than failing silent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';

const { sendMock, batchSendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  batchSendMock: vi.fn(),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
    batch = { send: batchSendMock };
  },
}));

import {
  clearTestInbox,
  resolveDeliveryMode,
  sendBulkEmail,
  sendEmail,
  testInbox,
} from '../src/send';

const body = () => createElement('div', null, 'hello');

function message(overrides: Record<string, unknown> = {}) {
  return {
    to: 'resident@example.com',
    subject: 'Your invitation',
    react: body(),
    category: 'transactional' as const,
    ...overrides,
  };
}

let infoSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  clearTestInbox();
  delete process.env.EMAIL_DRY_RUN;
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM;
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  sendMock.mockResolvedValue({ data: { id: 'resend-1' }, error: null });
  batchSendMock.mockResolvedValue({ data: { data: [{ id: 'resend-b1' }] }, error: null });
});

afterEach(() => {
  infoSpy.mockRestore();
  delete process.env.EMAIL_DRY_RUN;
  delete process.env.RESEND_API_KEY;
});

describe('resolveDeliveryMode', () => {
  it('is unconfigured with no key and no dry-run flag', () => {
    expect(resolveDeliveryMode()).toBe('unconfigured');
  });

  it('is live when a key is present', () => {
    process.env.RESEND_API_KEY = 're_live_key';
    expect(resolveDeliveryMode()).toBe('live');
  });

  it('is dry-run when the flag is set, EVEN WITH a live key', () => {
    process.env.RESEND_API_KEY = 're_live_key';
    process.env.EMAIL_DRY_RUN = '1';
    expect(resolveDeliveryMode()).toBe('dry-run');
  });

  it.each(['1', 'true', 'TRUE', 'yes', 'on'])('treats %s as dry-run', (value) => {
    process.env.EMAIL_DRY_RUN = value;
    expect(resolveDeliveryMode()).toBe('dry-run');
  });

  it.each(['', '0', 'false', 'FALSE', 'no'])(
    'treats %j as NOT dry-run, so an off-switch cannot silently suppress mail',
    (value) => {
      process.env.RESEND_API_KEY = 're_live_key';
      process.env.EMAIL_DRY_RUN = value;
      expect(resolveDeliveryMode()).toBe('live');
    },
  );
});

describe('sendEmail', () => {
  it('delivers for real when live', async () => {
    process.env.RESEND_API_KEY = 're_live_key';

    const result = await sendEmail(message());

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('resend-1');
    expect(testInbox).toHaveLength(0);
  });

  it('transmits NOTHING in dry-run despite a live key', async () => {
    process.env.RESEND_API_KEY = 're_live_key';
    process.env.EMAIL_DRY_RUN = '1';

    const result = await sendEmail(message());

    expect(sendMock).not.toHaveBeenCalled();
    expect(batchSendMock).not.toHaveBeenCalled();
    expect(result.id).toBe('dryrun_1');
    expect(testInbox).toHaveLength(1);
    expect(testInbox[0]?.to).toBe('resident@example.com');
  });

  it('reports each suppressed message so a dry run is not a silent no-op', async () => {
    process.env.RESEND_API_KEY = 're_live_key';
    process.env.EMAIL_DRY_RUN = '1';

    await sendEmail(message({ to: ['a@example.com', 'b@example.com'] }));

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const line = String(infoSpy.mock.calls[0]?.[0]);
    expect(line).toContain('[email:dry-run]');
    expect(line).toContain('a@example.com, b@example.com');
    expect(line).toContain('Your invitation');
    expect(line).toContain('transactional');
  });

  it('never logs the rendered body — templates carry tokens and reset links', async () => {
    process.env.RESEND_API_KEY = 're_live_key';
    process.env.EMAIL_DRY_RUN = '1';

    await sendEmail(
      message({ react: createElement('a', { href: 'https://x/accept?token=SUPERSECRETTOKEN' }, 'Accept') }),
    );

    // Assert a line was emitted BEFORE asserting what it omits — otherwise
    // deleting logSuppressed entirely would satisfy the negative assertions
    // against an empty string and this test would pass while proving nothing.
    expect(infoSpy).toHaveBeenCalled();
    const logged = infoSpy.mock.calls.flat().map(String).join(' ');
    expect(logged).not.toContain('SUPERSECRETTOKEN');
    expect(logged).not.toContain('accept?token');
  });

  it('stays silent (no log) when merely unconfigured', async () => {
    const result = await sendEmail(message());

    expect(sendMock).not.toHaveBeenCalled();
    expect(result.id).toBe('test_1');
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('still enforces the List-Unsubscribe requirement in dry-run', async () => {
    process.env.EMAIL_DRY_RUN = '1';

    await expect(
      sendEmail(message({ category: 'non-transactional' })),
    ).rejects.toThrow(/List-Unsubscribe/);

    expect(testInbox).toHaveLength(0);
  });
});

describe('sendBulkEmail', () => {
  it('transmits NOTHING in dry-run despite a live key', async () => {
    process.env.RESEND_API_KEY = 're_live_key';
    process.env.EMAIL_DRY_RUN = '1';

    const result = await sendBulkEmail([
      message({ to: 'one@example.com' }),
      message({ to: 'two@example.com' }),
    ]);

    expect(batchSendMock).not.toHaveBeenCalled();
    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(0);
    expect(result.results.map((r) => r.id)).toEqual(['dryrun_1', 'dryrun_2']);
    expect(testInbox).toHaveLength(2);
  });

  it('reports a count so a large suppressed run is visible', async () => {
    process.env.RESEND_API_KEY = 're_live_key';
    process.env.EMAIL_DRY_RUN = '1';

    await sendBulkEmail([message(), message(), message()]);

    const logged = infoSpy.mock.calls.flat().map(String).join('\n');
    expect(logged).toContain('suppressed 3 bulk message(s)');
  });

  it('delivers for real when live', async () => {
    process.env.RESEND_API_KEY = 're_live_key';

    const result = await sendBulkEmail([message()]);

    expect(batchSendMock).toHaveBeenCalledTimes(1);
    expect(result.successCount).toBe(1);
    expect(testInbox).toHaveLength(0);
  });
});
