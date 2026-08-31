import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { SmsProvider } from '@/lib/services/sms/sms-provider';
import type { SmsSendRequest, SmsSendResult } from '@/lib/services/sms/sms-types';
import {
  sendEmergencySms,
  sendBulkEmergencySms,
  validateSmsWebhookSignature,
  setSmsProvider,
  resetSmsProvider,
} from '@/lib/services/sms/sms-service';
import {
  isStatusAdvancement,
  SMS_STATUS_ORDER,
} from '@/lib/services/sms/sms-types';

// ── Mock provider ───────────────────────────────────────────────────────────

function createMockProvider(overrides?: Partial<SmsProvider>): SmsProvider {
  return {
    sendSms: vi.fn(async (): Promise<SmsSendResult> => ({
      success: true,
      providerMessageId: 'SM_test_123',
      status: 'queued',
      errorCode: null,
      errorMessage: null,
    })),
    validateWebhookSignature: vi.fn(() => true),
    ...overrides,
  };
}

describe('SMS Service', () => {
  let mockProvider: SmsProvider;

  beforeEach(() => {
    mockProvider = createMockProvider();
    setSmsProvider(mockProvider);
    // SMS ships DISABLED via the SMS_DISPATCH_ENABLED floor. These tests cover
    // the SENDING behaviour, so they opt in explicitly; the kill switch itself
    // is covered by its own describe block below.
    vi.stubEnv('SMS_DISPATCH_ENABLED', 'true');
  });

  afterEach(() => {
    resetSmsProvider();
    vi.unstubAllEnvs();
  });

  // ── Global kill switch ────────────────────────────────────────────────────
  //
  // The contract these tests pin down is subtle and load-bearing: when SMS is
  // off the service must RETURN a skipped result, never throw. Emergency
  // broadcasts fan out SMS and email together, so a throw here could take the
  // email leg down with it — and a resident losing their hurricane notice
  // because we disabled texting would be a far worse outcome than the TCPA
  // record-keeping gap we are avoiding.
  // See docs/audits/2026-08-09-legal-risk-audit.md F-10.
  describe('SMS_DISPATCH_ENABLED kill switch', () => {
    beforeEach(() => {
      vi.stubEnv('SMS_DISPATCH_ENABLED', '');
    });

    it('does not call the provider when dispatch is disabled', async () => {
      const result = await sendEmergencySms('+13055551234', 'Test alert');

      expect(mockProvider.sendSms).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.status).toBe('skipped');
      expect(result.errorCode).toBe('SMS_DISABLED');
    });

    it('does not throw when dispatch is disabled', async () => {
      await expect(sendEmergencySms('+13055551234', 'Test alert')).resolves.toBeDefined();
    });

    it('skips every recipient in a bulk send without calling the provider', async () => {
      const result = await sendBulkEmergencySms({
        recipients: [
          { userId: 'u1', phone: '+13055551234' },
          { userId: 'u2', phone: '+13055555678' },
        ],
        body: 'Evacuate',
      });

      expect(mockProvider.sendSms).not.toHaveBeenCalled();
      expect(result.successCount).toBe(0);
      // Reported as 'skipped', not 'failed' — a delivery report must read as
      // "not attempted", not as a carrier problem.
      expect(result.failureCount).toBe(0);
      expect(result.results.get('u1')?.status).toBe('skipped');
      expect(result.results.get('u2')?.status).toBe('skipped');
    });

    it('treats a non-exact env value as disabled', async () => {
      // Only the exact string 'true' enables SMS. 'TRUE' / '1' / 'yes' must not.
      for (const value of ['TRUE', '1', 'yes', 'enabled']) {
        vi.stubEnv('SMS_DISPATCH_ENABLED', value);
        const result = await sendEmergencySms('+13055551234', 'Test');
        expect(result.status, `env value ${value} should not enable SMS`).toBe('skipped');
      }
      expect(mockProvider.sendSms).not.toHaveBeenCalled();
    });

    it('still validates phone numbers before the kill switch short-circuits', async () => {
      // Input validation is not a dispatch concern — a malformed number should
      // surface as a bug regardless of whether SMS is switched on.
      await expect(sendEmergencySms('not-a-number', 'Test')).rejects.toThrow(
        /Invalid phone number/,
      );
    });
  });

  describe('sendEmergencySms', () => {
    it('sends SMS via provider', async () => {
      const result = await sendEmergencySms('+13055551234', 'Test alert');

      expect(mockProvider.sendSms).toHaveBeenCalledWith({
        to: '+13055551234',
        body: 'Test alert',
        statusCallbackUrl: undefined,
      });
      expect(result.success).toBe(true);
      expect(result.providerMessageId).toBe('SM_test_123');
    });

    it('passes status callback URL', async () => {
      await sendEmergencySms('+13055551234', 'Test', 'https://example.com/webhook');

      expect(mockProvider.sendSms).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCallbackUrl: 'https://example.com/webhook',
        }),
      );
    });

    it('returns failure on provider error', async () => {
      const failProvider = createMockProvider({
        sendSms: vi.fn(async () => ({
          success: false,
          providerMessageId: null,
          status: 'failed' as const,
          errorCode: '30003',
          errorMessage: 'Unreachable',
        })),
      });
      setSmsProvider(failProvider);

      const result = await sendEmergencySms('+13055551234', 'Test');
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('30003');
    });

    it('rejects invalid phone numbers before calling the provider', async () => {
      await expect(sendEmergencySms('3055551234', 'Test')).rejects.toThrow(
        'Invalid phone number: 3055551234',
      );

      expect(mockProvider.sendSms).not.toHaveBeenCalled();
    });
  });

  describe('sendBulkEmergencySms', () => {
    it('sends to multiple recipients', async () => {
      const result = await sendBulkEmergencySms({
        recipients: [
          { userId: 'u1', phone: '+13055551111' },
          { userId: 'u2', phone: '+13055552222' },
          { userId: 'u3', phone: '+13055553333' },
        ],
        body: 'Emergency test',
      });

      expect(result.successCount).toBe(3);
      expect(result.failureCount).toBe(0);
      expect(result.results.size).toBe(3);
      expect(result.results.get('u1')?.success).toBe(true);
    });

    it('handles partial failures', async () => {
      let callCount = 0;
      const partialFailProvider = createMockProvider({
        sendSms: vi.fn(async () => {
          callCount++;
          if (callCount === 2) {
            return {
              success: false,
              providerMessageId: null,
              status: 'failed' as const,
              errorCode: 'TIMEOUT',
              errorMessage: 'Timeout',
            };
          }
          return {
            success: true,
            providerMessageId: `SM_${callCount}`,
            status: 'queued' as const,
            errorCode: null,
            errorMessage: null,
          };
        }),
      });
      setSmsProvider(partialFailProvider);

      const result = await sendBulkEmergencySms({
        recipients: [
          { userId: 'u1', phone: '+13055551111' },
          { userId: 'u2', phone: '+13055552222' },
          { userId: 'u3', phone: '+13055553333' },
        ],
        body: 'Test',
      });

      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);
      expect(result.results.get('u2')?.success).toBe(false);
    });

    it('handles empty recipients', async () => {
      const result = await sendBulkEmergencySms({
        recipients: [],
        body: 'Test',
      });

      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(0);
      expect(result.results.size).toBe(0);
    });
  });

  describe('validateSmsWebhookSignature', () => {
    it('delegates to provider', () => {
      const result = validateSmsWebhookSignature('sig', 'url', { key: 'val' });
      expect(result).toBe(true);
      expect(mockProvider.validateWebhookSignature).toHaveBeenCalledWith('sig', 'url', { key: 'val' });
    });
  });
});

describe('SMS status advancement', () => {
  it('allows forward progression', () => {
    expect(isStatusAdvancement('pending', 'queued')).toBe(true);
    expect(isStatusAdvancement('queued', 'sent')).toBe(true);
    expect(isStatusAdvancement('sent', 'delivered')).toBe(true);
    expect(isStatusAdvancement('queued', 'failed')).toBe(true);
  });

  it('rejects backward progression', () => {
    expect(isStatusAdvancement('delivered', 'sent')).toBe(false);
    expect(isStatusAdvancement('sent', 'queued')).toBe(false);
    expect(isStatusAdvancement('failed', 'pending')).toBe(false);
  });

  it('rejects same status', () => {
    expect(isStatusAdvancement('sent', 'sent')).toBe(false);
    expect(isStatusAdvancement('delivered', 'delivered')).toBe(false);
  });

  it('has correct status ordering', () => {
    expect(SMS_STATUS_ORDER['pending']).toBe(0);
    expect(SMS_STATUS_ORDER['queued']).toBe(1);
    expect(SMS_STATUS_ORDER['sent']).toBe(2);
    expect(SMS_STATUS_ORDER['delivered']).toBe(3);
    expect(SMS_STATUS_ORDER['failed']).toBe(3);
    expect(SMS_STATUS_ORDER['undelivered']).toBe(3);
  });
});
