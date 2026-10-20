import { describe, expect, it } from 'vitest';
import {
  centsToDollars,
  formatCentsAsCurrency,
  formatDollarsAsCurrency,
} from '@/lib/billing/format';

describe('lib/billing/format', () => {
  it('formats dollars as whole USD', () => {
    expect(formatDollarsAsCurrency(4200)).toBe('$4,200');
    expect(formatDollarsAsCurrency(-125)).toBe('-$125');
  });

  it('renders a non-finite dollar amount as $0, never $NaN', () => {
    // KpiGrid and RevenueCard used private Intl copies that printed `$NaN`
    // (audit R-05); they now share this guard.
    expect(formatDollarsAsCurrency(Number.NaN)).toBe('$0');
    expect(formatDollarsAsCurrency(Number.POSITIVE_INFINITY)).toBe('$0');
  });

  it('divides cents by 100 exactly once', () => {
    expect(formatCentsAsCurrency(420_000)).toBe('$4,200');
    expect(centsToDollars(Number.NaN)).toBe(0);
  });
});
