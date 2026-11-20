import { describe, expect, it } from 'vitest';
import { formatErrorForLog } from '../src/observability/format-error-for-log';

/**
 * The exact shape of drizzle-orm's DrizzleQueryError message
 * (node_modules/drizzle-orm/errors.js): `Failed query: <sql>\nparams: <values>`.
 * The newline INSIDE the message is what makes naive stack handling wrong:
 * `redactParams(err.stack)` would truncate at the marker in the stack's first
 * line and destroy every `at …` frame — losing the call site for exactly the
 * errors this helper exists for.
 */
const DRIZZLE_MESSAGE =
  'Failed query: select * from users where email = $1\nparams: ["canary@x.com","CANARY_VALUE_9F3"]';

describe('formatErrorForLog', () => {
  it('redacts drizzle bound params out of the message, keeping the SQL', () => {
    const out = formatErrorForLog(new Error(DRIZZLE_MESSAGE));
    expect(out).toContain('Failed query: select * from users');
    expect(out).toContain('params: [redacted]');
    expect(out).not.toContain('canary@x.com');
    expect(out).not.toContain('CANARY_VALUE_9F3');
  });

  it('PRESERVES every stack frame — they are the call site', () => {
    // Anti-vacuity probe for the frame-preservation half: a redactParams(stack)
    // implementation passes the redaction test above while silently dropping
    // all frames for drizzle-shaped errors.
    const err = new Error(DRIZZLE_MESSAGE);
    const out = formatErrorForLog(err);
    const frameCount = (err.stack?.match(/\n\s+at /g) ?? []).length;
    expect(frameCount).toBeGreaterThan(0); // probe: the fixture really has frames
    expect((out.match(/\n\s+at /g) ?? []).length).toBe(frameCount);
  });

  it('does not duplicate the message via the stack header line', () => {
    const out = formatErrorForLog(new Error('plain failure'));
    // The stack's own first line (`Error: plain failure`) repeats the message;
    // the output must carry the message exactly once, then the frames.
    expect(out.startsWith('plain failure')).toBe(true);
    expect(out.match(/plain failure/g)?.length).toBe(1);
    expect(out).toContain('\n    at ');
  });

  it('keeps a multi-line non-drizzle message whole and unduplicated', () => {
    const out = formatErrorForLog(new Error('line one\nline two'));
    expect(out.startsWith('line one\nline two')).toBe(true);
    expect(out.match(/line two/g)?.length).toBe(1);
    expect(out).toContain('\n    at ');
  });

  it('redacts params carried by a non-Error value via String()', () => {
    const out = formatErrorForLog(`prefix ${DRIZZLE_MESSAGE}`);
    expect(out).toContain('params: [redacted]');
    expect(out).not.toContain('canary@x.com');
  });

  it('passes an ordinary string through untouched', () => {
    expect(formatErrorForLog('job skipped: nothing to do')).toBe(
      'job skipped: nothing to do',
    );
  });

  it('does not throw on an Error without a stack', () => {
    const err = new Error('stackless');
    (err as { stack?: string }).stack = undefined;
    expect(formatErrorForLog(err)).toBe('stackless');
  });

  it('stays redacted when the stack header does NOT align with name+message', () => {
    // Pathological shape (hand-assigned stack, or name/message mutated after
    // the stack was materialized): the header slice misses and the fallback
    // runs. The stack's second line is the message's raw `params:` continuation
    // — the fallback must not re-admit it. Found by the security review.
    const err = new Error(DRIZZLE_MESSAGE);
    err.stack = 'WeirdHeader\nparams: ["canary@x.com","CANARY_VALUE_9F3"]\n    at fake (x.js:1:1)';
    const out = formatErrorForLog(err);
    expect(out).not.toContain('canary@x.com');
    expect(out).not.toContain('CANARY_VALUE_9F3');
    expect(out).toContain('params: [redacted]');
  });

  it('never throws on a value whose String() throws', () => {
    // Object.create(null) has no toString — String() on it raises TypeError.
    // A logger that throws from inside a catch block replaces the real failure.
    const hostile: unknown = Object.create(null);
    expect(() => formatErrorForLog(hostile)).not.toThrow();
    expect(formatErrorForLog(hostile)).toBe('[unstringifiable value]');
  });
});
