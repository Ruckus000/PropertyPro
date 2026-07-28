// CHAOS EXPERIMENT — must FAIL loudly. Not committed.
// A brand-new .test.ts outside the jsdom globs must land in the node project.
import { describe, it, expect } from 'vitest';
describe('chaos: DOM access from a default-bucket test', () => {
  it('touches document', () => {
    document.title = 'x';
    expect(document.title).toBe('x');
  });
});
