import { describe, expect, it } from 'vitest';
import {
  calculateConvenienceFee,
  calculateStripeFeeEstimate,
  CARD_RATE,
  CARD_FIXED_CENTS,
  ACH_RATE,
  ACH_CAP_CENTS,
} from '../payment-fees';

describe('calculateConvenienceFee', () => {
  describe('card payments', () => {
    it('calculates fee for a $500 assessment', () => {
      const fee = calculateConvenienceFee(50_000, 'card');
      // (50000 * 0.029 + 30) / 0.971 = 1524.2 → ceil(1524.2/5)*5 = 1525
      expect(fee).toBe(1525);
    });

    it('calculates fee for a $100 assessment', () => {
      const fee = calculateConvenienceFee(10_000, 'card');
      // (10000 * 0.029 + 30) / 0.971 = 320.28... → ceil(320.28/5)*5 = 330 (due to floating point)
      expect(fee).toBe(330);
    });

    it('calculates fee for a $50,000 special assessment', () => {
      const fee = calculateConvenienceFee(5_000_000, 'card');
      // (5000000 * 0.029 + 30) / 0.971 = ~149361 → ceil/5*5 = 149365
      expect(fee).toBe(149_365);
    });

    it('returns 0 for zero amount', () => {
      expect(calculateConvenienceFee(0, 'card')).toBe(0);
    });

    it('returns 0 for negative amount', () => {
      expect(calculateConvenienceFee(-100, 'card')).toBe(0);
    });

    it('always covers Stripe fee on the total (platform never loses money)', () => {
      // For various amounts, the convenience fee should cover Stripe's charge
      // on the total (assessment + fee)
      for (const amountCents of [1_000, 10_000, 50_000, 100_000, 500_000]) {
        const fee = calculateConvenienceFee(amountCents, 'card');
        const totalCharge = amountCents + fee;
        const stripeFee = totalCharge * CARD_RATE + CARD_FIXED_CENTS;
        expect(fee).toBeGreaterThanOrEqual(Math.ceil(stripeFee));
      }
    });

    it('is always a multiple of 5 cents', () => {
      for (const amountCents of [1_000, 12_345, 50_000, 99_999]) {
        const fee = calculateConvenienceFee(amountCents, 'card');
        expect(fee % 5).toBe(0);
      }
    });
  });

  describe('ACH payments', () => {
    it('calculates fee for a $500 assessment', () => {
      const fee = calculateConvenienceFee(50_000, 'us_bank_account');
      // (50000 * 0.008) / 0.992 = 403.22... → ceil(403.22/5)*5 = 405
      expect(fee).toBe(405);
    });

    it('caps at $5.25 for large amounts', () => {
      // At 0.8% rate, $625+ would exceed $5 cap
      const fee = calculateConvenienceFee(100_000, 'us_bank_account');
      // (100000 * 0.008) / 0.992 = 806.45... but capped at 505 → ceil(505/5)*5 = 505
      expect(fee).toBe(505);
    });

    it('returns 0 for zero amount', () => {
      expect(calculateConvenienceFee(0, 'us_bank_account')).toBe(0);
    });

    it('is always a multiple of 5 cents', () => {
      for (const amountCents of [1_000, 25_000, 50_000, 100_000]) {
        const fee = calculateConvenienceFee(amountCents, 'us_bank_account');
        expect(fee % 5).toBe(0);
      }
    });

    it('caps do not exceed ACH_CAP + buffer', () => {
      const fee = calculateConvenienceFee(1_000_000, 'us_bank_account');
      expect(fee).toBeLessThanOrEqual(ACH_CAP_CENTS + 25); // max rounding
    });
  });
});

describe('calculateStripeFeeEstimate', () => {
  describe('card payments', () => {
    it('estimates fee for a $500 charge', () => {
      const fee = calculateStripeFeeEstimate(50_000, 'card');
      // 50000 * 0.029 + 30 = 1480 → ceil(1480/5)*5 = 1480
      expect(fee).toBe(1480);
    });

    it('is always a multiple of 5 cents', () => {
      const fee = calculateStripeFeeEstimate(12_345, 'card');
      expect(fee % 5).toBe(0);
    });

    it('returns 0 for zero amount', () => {
      expect(calculateStripeFeeEstimate(0, 'card')).toBe(0);
    });
  });

  describe('ACH payments', () => {
    it('estimates fee for a $500 charge', () => {
      const fee = calculateStripeFeeEstimate(50_000, 'us_bank_account');
      // 50000 * 0.008 = 400 → ceil(400/5)*5 = 400
      expect(fee).toBe(400);
    });

    it('caps at $5.00 for large amounts', () => {
      const fee = calculateStripeFeeEstimate(100_000, 'us_bank_account');
      // 100000 * 0.008 = 800, capped at 500 → ceil(500/5)*5 = 500
      expect(fee).toBe(500);
    });

    it('returns 0 for zero amount', () => {
      expect(calculateStripeFeeEstimate(0, 'us_bank_account')).toBe(0);
    });
  });
});
