/**
 * Payments block schema — chiefly the open-redirect matrix on `ctaTarget`.
 *
 * The validation itself is `ctaTargetSchema`'s, reused rather than
 * reimplemented. These tests exist because the payments block is the one that
 * puts a PM-supplied URL on a public page, so the reuse has to be verified
 * rather than assumed: a future refactor that swapped in a local URL check
 * would pass every other test in this suite.
 */
import { describe, it, expect } from 'vitest';
import { paymentsBlockSchema } from '../../src/site-blocks/payments';

const accepts = (target: string) =>
  paymentsBlockSchema.safeParse({ ctaTarget: target }).success;

describe('payments block — ctaTarget open-redirect matrix', () => {
  it.each([
    ['//evil.com', 'protocol-relative'],
    ['/\\evil.com', 'backslash after a slash — browsers normalise this to //'],
    ['\\\\evil.com', 'double backslash'],
    ['/\\/\\evil.com', 'mixed slash/backslash'],
    ['javascript:alert(1)', 'javascript scheme'],
    ['http://evil.com', 'plain http'],
    ['data:text/html,<script>alert(1)</script>', 'data URI'],
    ['ftp://example.com', 'other scheme'],
  ])('rejects %s (%s)', (target) => {
    expect(accepts(target)).toBe(false);
  });

  it.each([
    ['https://yourassociation.clickpay.com', 'a third-party processor'],
    ['https://example.com/pay?unit=12', 'query strings survive'],
    ['/payments', 'an internal path'],
  ])('accepts %s (%s)', (target) => {
    expect(accepts(target)).toBe(true);
  });

  it('rejects a target longer than the schema allows', () => {
    expect(accepts(`https://example.com/${'a'.repeat(512)}`)).toBe(false);
  });
});

describe('payments block — content', () => {
  it('accepts an entirely empty block, since the renderer has defaults', () => {
    expect(paymentsBlockSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a fully authored block', () => {
    expect(
      paymentsBlockSchema.safeParse({
        heading: 'Pay your assessment',
        body: 'Quarterly assessments are due on the first.',
        ctaText: 'Pay now',
        ctaTarget: 'https://yourassociation.clickpay.com',
      }).success,
    ).toBe(true);
  });

  it('rejects unknown keys (mass assignment)', () => {
    // Every block schema is .strict() — see the phase's security summary.
    expect(paymentsBlockSchema.safeParse({ heading: 'X', amount: 500 }).success).toBe(false);
  });

  it('rejects empty strings rather than rendering blank authored text', () => {
    expect(paymentsBlockSchema.safeParse({ heading: '' }).success).toBe(false);
    expect(paymentsBlockSchema.safeParse({ ctaText: '' }).success).toBe(false);
  });

  it('rejects an over-long body', () => {
    expect(paymentsBlockSchema.safeParse({ body: 'a'.repeat(601) }).success).toBe(false);
  });
});
