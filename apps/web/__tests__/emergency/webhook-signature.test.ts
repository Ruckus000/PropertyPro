/**
 * Tests for Twilio webhook signature validation.
 *
 * Verifies that invalid/missing signatures are rejected
 * and valid signatures are accepted.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { SmsProvider } from '@/lib/services/sms/sms-provider';
import {
  validateSmsWebhookSignature,
  setSmsProvider,
  resetSmsProvider,
} from '@/lib/services/sms/sms-service';

describe('Webhook signature validation', () => {
  afterEach(() => {
    resetSmsProvider();
  });

  it('rejects when provider returns false', () => {
    const provider: SmsProvider = {
      sendSms: vi.fn(),
      validateWebhookSignature: vi.fn(() => false),
    };
    setSmsProvider(provider);

    const result = validateSmsWebhookSignature('bad-sig', 'https://example.com/webhook', {
      MessageSid: 'SM123',
      MessageStatus: 'delivered',
    });

    expect(result).toBe(false);
    expect(provider.validateWebhookSignature).toHaveBeenCalledWith(
      'bad-sig',
      'https://example.com/webhook',
      { MessageSid: 'SM123', MessageStatus: 'delivered' },
    );
  });

  it('accepts when provider returns true', () => {
    const provider: SmsProvider = {
      sendSms: vi.fn(),
      validateWebhookSignature: vi.fn(() => true),
    };
    setSmsProvider(provider);

    const result = validateSmsWebhookSignature('valid-sig', 'https://example.com/webhook', {
      MessageSid: 'SM123',
      MessageStatus: 'delivered',
    });

    expect(result).toBe(true);
  });

  it('rejects empty signature', () => {
    const provider: SmsProvider = {
      sendSms: vi.fn(),
      validateWebhookSignature: vi.fn((sig) => sig.length > 0),
    };
    setSmsProvider(provider);

    expect(validateSmsWebhookSignature('', 'https://example.com', {})).toBe(false);
  });
});
