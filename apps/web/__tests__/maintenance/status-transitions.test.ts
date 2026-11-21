/**
 * The maintenance status table shared by the PATCH route and the manager's form.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  allowedNextStatuses,
  isAllowedStatusTransition,
} from '../../src/lib/maintenance/status-transitions';

describe('maintenance status transitions', () => {
  it.each([
    ['open', ['submitted', 'acknowledged', 'in_progress']],
    ['submitted', ['acknowledged', 'in_progress']],
    ['acknowledged', ['submitted', 'in_progress']],
    ['in_progress', ['submitted', 'resolved']],
    ['resolved', ['closed']],
    ['closed', []],
  ])('%s may move to %j', (from, to) => {
    expect(allowedNextStatuses(from)).toEqual(to);
  });

  it('moves an unknown status nowhere, including names of Object.prototype members', () => {
    for (const status of ['', 'cancelled', 'constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(allowedNextStatuses(status)).toEqual([]);
      expect(isAllowedStatusTransition(status, 'closed')).toBe(false);
    }
  });

  it('never lets a closed request reopen, nor skip straight from submitted to resolved', () => {
    expect(isAllowedStatusTransition('closed', 'submitted')).toBe(false);
    expect(isAllowedStatusTransition('submitted', 'resolved')).toBe(false);
    expect(isAllowedStatusTransition('resolved', 'closed')).toBe(true);
  });

  it('imports nothing, so the client form can take it without server code', () => {
    const source = readFileSync(
      resolve(__dirname, '../../src/lib/maintenance/status-transitions.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\brequire\(/);
  });
});
