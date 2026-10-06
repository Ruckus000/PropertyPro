/**
 * Per-manager cap on email sent from the Directory's sending features:
 * document sends (`/api/v1/documents/send`) and invitations (single and
 * batch). One unit per recipient, shared across every community the manager
 * manages. System email (password reset, digests, payments) is not counted.
 *
 * Checked BEFORE anything is sent: a request that would exceed the budget is
 * refused whole, so a send is never half-delivered by the cap.
 *
 * Redis (Upstash) when configured, so the count holds across server instances;
 * otherwise the in-memory limiter — degrade, don't fail open — which counts per
 * instance (the same trade-off as `checkRateLimit`).
 */
import { RateLimitError } from '@/lib/api/errors/RateLimitError';
import { consumeKeyedRateLimit } from '@/lib/api/keyed-rate-limit';

/** Raise here (product decision, 2026-10-02: start at 100). */
export const EMAIL_RECIPIENTS_PER_MINUTE = 100;
const WINDOW_MS = 60_000;

export async function consumeEmailBudget(userId: string, recipients: number): Promise<void> {
  if (recipients <= 0) return;
  const key = `rl:email:user:${userId}`;
  const verdict = await consumeKeyedRateLimit(key, EMAIL_RECIPIENTS_PER_MINUTE, WINDOW_MS, recipients);
  if (!verdict.allowed) {
    throw new RateLimitError(
      `Email limit reached: ${EMAIL_RECIPIENTS_PER_MINUTE} emails per minute. Try again in ${verdict.retryAfter} seconds.`,
    );
  }
}
