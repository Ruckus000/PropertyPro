/**
 * The per-manager email cap (100 recipients a minute). Without Redis it must
 * still hold — per instance, via the in-memory limiter — never fail open.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resetGlobalRateLimiter } from '../../../src/lib/middleware/rate-limiter';
import { EMAIL_RECIPIENTS_PER_MINUTE, consumeEmailBudget } from '../../../src/lib/api/email-budget';

describe('consumeEmailBudget', () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    resetGlobalRateLimiter();
  });

  it('allows up to 100 recipients a minute per manager, refusing the call that would exceed it', async () => {
    expect(EMAIL_RECIPIENTS_PER_MINUTE).toBe(100);
    await expect(consumeEmailBudget('pm-1', 60)).resolves.toBeUndefined();
    await expect(consumeEmailBudget('pm-1', 41)).rejects.toMatchObject({
      statusCode: 429,
      message: expect.stringMatching(/^Email limit reached: 100 emails per minute\. Try again in \d+ seconds\.$/),
    });
    // The refused call consumed nothing: 40 still fit.
    await expect(consumeEmailBudget('pm-1', 40)).resolves.toBeUndefined();
    await expect(consumeEmailBudget('pm-1', 1)).rejects.toMatchObject({ statusCode: 429 });
  });

  it('is per manager: another manager has their own budget', async () => {
    await consumeEmailBudget('pm-1', 100);
    await expect(consumeEmailBudget('pm-2', 100)).resolves.toBeUndefined();
  });

  it('charges nothing for zero recipients', async () => {
    await consumeEmailBudget('pm-1', 100);
    await expect(consumeEmailBudget('pm-1', 0)).resolves.toBeUndefined();
  });
});
