import { describe, expect, it } from 'vitest';
import { escapeCSVField as escapeCell } from '@/lib/utils/csv-cell';

describe('escapeCell — CSV formula injection', () => {
  it.each([
    ['=HYPERLINK("http://evil","x")', `"'=HYPERLINK(""http://evil"",""x"")"`],
    ['+cmd|calc', `'+cmd|calc`],
    ['-2+3', `'-2+3`],
    ['@SUM(A1)', `'@SUM(A1)`],
    ['\tTab', `'\tTab`],
  ])('neutralises %j', (input, expected) => {
    expect(escapeCell(input)).toBe(expected);
  });

  it.each([
    ['-12.5', '-12.5'],
    ['-$1,250.00', '"-$1,250.00"'],
    ['+3', '+3'],
    ['15%', '15%'],
    [-42, '-42'],
    ['Maria Gonzalez', 'Maria Gonzalez'],
    [null, ''],
  ] as const)('leaves data alone: %j', (input, expected) => {
    expect(escapeCell(input)).toBe(expected);
  });
});
