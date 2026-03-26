import { describe, expect, it } from 'vitest';
import {
  PAYABLE_SOURCE_TYPES,
  PAYABLE_TYPES,
  LEDGER_ENTRY_TYPES,
  LEDGER_SOURCE_TYPES,
} from '..';

describe('payable contract constants', () => {
  it('includes rent-capable payable/source contracts', () => {
    expect(PAYABLE_TYPES).toContain('assessment_line_item');
    expect(PAYABLE_TYPES).toContain('rent_obligation');
    expect(PAYABLE_SOURCE_TYPES).toContain('assessment');
    expect(PAYABLE_SOURCE_TYPES).toContain('rent');
  });

  it('extends ledger contracts without dropping assessment values', () => {
    expect(LEDGER_ENTRY_TYPES).toContain('assessment');
    expect(LEDGER_ENTRY_TYPES).toContain('rent');
    expect(LEDGER_SOURCE_TYPES).toContain('assessment');
    expect(LEDGER_SOURCE_TYPES).toContain('rent');
  });
});
