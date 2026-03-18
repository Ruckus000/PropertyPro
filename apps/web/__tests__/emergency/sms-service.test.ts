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
  });

  afterEach(() => {
    resetSmsProvider();
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
