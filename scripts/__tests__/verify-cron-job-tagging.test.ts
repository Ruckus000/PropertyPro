import { describe, expect, it } from 'vitest';

import {
  analyzeRoute,
  checkWindow,
  maxIntervalMinutes,
  slugForPath,
} from '../verify-cron-job-tagging';

/**
 * Unit tests for the predicates behind `pnpm guard:cron-job-tagging`.
 *
 * The guard's whole value is telling a correctly-wrapped route from one where
 * `withCronJob` sits INSIDE `withErrorHandler` — a difference that produces no
 * error, no warning, and an untagged Sentry event, i.e. exactly the invisible
 * failure #1042 was. A guard that cannot make that distinction reliably is
 * worse than none, because it looks like coverage.
 */
describe('slugForPath', () => {
  it('maps a top-level cron path to its folder name', () => {
    expect(slugForPath('/api/v1/internal/scheduled-site-publish')).toBe('scheduled-site-publish');
  });

  it('flattens the one nested path, whose leaf folder names nothing', () => {
    // `process` alone would be meaningless as a job identity.
    expect(slugForPath('/api/v1/internal/notification-digests/process')).toBe(
      'notification-digests-process',
    );
  });
});

describe('maxIntervalMinutes', () => {
  it('reads a step schedule', () => {
    expect(maxIntervalMinutes('*/5 * * * *')).toBe(5);
    expect(maxIntervalMinutes('*/15 * * * *')).toBe(15);
  });

  it('reads a step that does NOT divide 60 by its widest gap, which is the step', () => {
    // `*/7` fires at :00 .. :56 then :00 again — gaps of 7 and a short 4 at the
    // wrap. The widest is 7. (The predecessor returned 7 here as a LOWER bound,
    // which was wrong in the other direction: the true minimum is 4. Neither
    // number ever mattered, because this repo only schedules */5 and */15.)
    expect(maxIntervalMinutes('*/7 * * * *')).toBe(7);
  });

  it('reads a minute LIST by its WIDEST gap, wrap included', () => {
    // scheduled-site-publish. All gaps are 15, including 50 -> 05 across the
    // hour boundary, which a naive last-minus-first would get wrong.
    expect(maxIntervalMinutes('5,20,35,50 * * * *')).toBe(15);
    // Deliberately lopsided: two firings a minute apart leave a 59-minute hole.
    expect(maxIntervalMinutes('0,1 * * * *')).toBe(59);
  });

  it('reads hourly and daily', () => {
    expect(maxIntervalMinutes('15 * * * *')).toBe(60);
    expect(maxIntervalMinutes('0 4 * * *')).toBe(1440);
  });

  it('reads every-minute, rather than refusing the most ordinary schedule', () => {
    expect(maxIntervalMinutes('* * * * *')).toBe(1);
  });

  it('REFUSES a day-of-month above 28 instead of halving the answer', () => {
    // Cron does not fire on a day a month lacks and does not roll forward, so
    // these skip whole months: D=29 -> 59 days, D=30 -> 60, D=31 -> 61 (Aug 31
    // -> Oct 31). Answering 31 days under-reported by up to 30 and would have
    // approved a window that reports a healthy job dead for a month — the exact
    // failure this guard exists to prevent, committed by the guard.
    expect(maxIntervalMinutes('0 5 29 * *')).toBeNull();
    expect(maxIntervalMinutes('0 5 30 * *')).toBeNull();
    expect(maxIntervalMinutes('0 5 31 * *')).toBeNull();
    // 28 is the last day every month has, so it is still answerable.
    expect(maxIntervalMinutes('0 5 28 * *')).toBe(31 * 1440);
  });

  it('REFUSES fields that are in shape but out of range', () => {
    // /^\d+$/ accepts `99`. These describe jobs that can never fire at all, and
    // each used to be handed a confident number.
    expect(maxIntervalMinutes('0 5 32 * *')).toBeNull();
    expect(maxIntervalMinutes('0 5 0 * *')).toBeNull();
    expect(maxIntervalMinutes('99 * * * *')).toBeNull();
    expect(maxIntervalMinutes('0 99 * * *')).toBeNull();
  });

  it('REFUSES an empty list element rather than reading it as minute 0', () => {
    // `Number('')` is 0 — an integer, and in range — so `'5,'` parsed as {0,5}
    // and returned a 55-minute widest gap for a schedule whose real answer is
    // 60. Under-reporting is the direction that approves a broken window.
    // NOTE the full five fields. An earlier version of this case passed bare
    // strings like '5,', which return null from the ARITY check without ever
    // reaching the list branch — the revert-check caught it passing against
    // code with the validation removed.
    expect(maxIntervalMinutes('5, * * * *')).toBeNull();
    expect(maxIntervalMinutes(',5 * * * *')).toBeNull();
    expect(maxIntervalMinutes('5,,20 * * * *')).toBeNull();
    // Coercions Number() would otherwise accept.
    expect(maxIntervalMinutes('5,0x1e * * * *')).toBeNull();
    expect(maxIntervalMinutes('5,1e1 * * * *')).toBeNull();
    expect(maxIntervalMinutes('5,+5 * * * *')).toBeNull();
  });

  it('reads MONTHLY as 31 days, not 28 — the whole point of this function', () => {
    // `0 5 1 * *` fires on the 1st. The shortest gap is 28 days (Feb -> Mar);
    // the longest is 31. A staleness window has to survive the LONGEST quiet
    // stretch, so 28 is the wrong bound to size against: it accepts every
    // maxAgeMinutes in (40320, 44640], each of which pages on every 31-day
    // month. generate-assessments sits at 46080, which clears 44640 by exactly
    // the one day of slack its MONTHLY constant claims.
    expect(maxIntervalMinutes('0 5 1 * *')).toBe(31 * 1440);
    expect(maxIntervalMinutes('0 5 1 * *')).not.toBe(28 * 1440);
  });

  it('returns null for a shape it does not understand, rather than guessing', () => {
    // The guard turns null into exit 2. Guessing here could approve a staleness
    // window that makes a job permanently overdue (alert fatigue) or
    // permanently fresh (no alerting at all) — both worse than admitting it
    // cannot tell.
    expect(maxIntervalMinutes('0 0 * * MON#2')).toBeNull();
    expect(maxIntervalMinutes('0 0 1 1 *')).toBeNull();
    expect(maxIntervalMinutes('not a schedule')).toBeNull();
  });
});

describe('analyzeRoute — is withCronJob the OUTERMOST wrapper?', () => {
  const wrap = (body: string) => `${body}\nexport const POST = cronHandler;\n`;

  it('accepts the canonical shape, following the binding back', () => {
    const src = wrap(`
      const handler = withErrorHandler(async () => new Response());
      const cronHandler = withCronJob('payment-reminders', handler);
      export const GET = cronHandler;
    `);
    expect(analyzeRoute('route.ts', src)).toMatchObject({
      outermostCall: 'withCronJob',
      slugArgument: 'payment-reminders',
    });
  });

  it('accepts a directly-exported call', () => {
    const src = `
      export const GET = withCronJob('expire-demos', withErrorHandler(handleIt));
      export const POST = withCronJob('expire-demos', withErrorHandler(handleIt));
    `;
    expect(analyzeRoute('route.ts', src)).toMatchObject({
      outermostCall: 'withCronJob',
      slugArgument: 'expire-demos',
    });
  });

  it('reports withErrorHandler as outermost when the nesting is INVERTED', () => {
    // The case the guard exists for. Runtime effect: no `job` tag, silently.
    const src = wrap(`
      const cronHandler = withErrorHandler(withCronJob('payment-reminders', handler));
      export const GET = cronHandler;
    `);
    expect(analyzeRoute('route.ts', src).outermostCall).toBe('withErrorHandler');
  });

  it('reports no call when the route is not wrapped at all', () => {
    const src = wrap(`
      const cronHandler = handler;
      export const GET = cronHandler;
    `);
    expect(analyzeRoute('route.ts', src).outermostCall).toBeNull();
  });

  it('surfaces a mismatched slug so a copy-pasted route is caught', () => {
    const src = wrap(`
      const cronHandler = withCronJob('snowbird-digest', handler);
      export const GET = cronHandler;
    `);
    expect(analyzeRoute('route.ts', src).slugArgument).toBe('snowbird-digest');
  });

  it('reports a non-literal slug as null rather than accepting it', () => {
    // A computed slug cannot be reconciled against the path, so it must not pass.
    const src = wrap(`
      const cronHandler = withCronJob(SLUG, handler);
      export const GET = cronHandler;
    `);
    expect(analyzeRoute('route.ts', src).slugArgument).toBeNull();
  });

  it('lists the exported verbs, so a GET-only cron is caught', () => {
    const src = `
      const cronHandler = withCronJob('expire-demos', handler);
      export const GET = cronHandler;
    `;
    expect(analyzeRoute('route.ts', src).exportedVerbs).toEqual(['GET']);
  });

  it('is not fooled by the shape appearing inside a comment or a string', () => {
    // A text-scanning guard would pass this. `guard:class-resolution` moved to
    // the TypeScript parser for exactly this reason.
    const src = `
      // export const GET = withCronJob('payment-reminders', handler);
      const note = "withCronJob('payment-reminders', handler)";
      const cronHandler = handler;
      export const GET = cronHandler;
      export const POST = cronHandler;
    `;
    expect(analyzeRoute('route.ts', src).outermostCall).toBeNull();
  });

/**
 * The staleness window, both ends.
 *
 * The lower bound was always enforced. The upper one was only ever PRINTED —
 * the caller asserted `maxAgeMinutes > longestGap`, reported the tightest
 * ratio, and stopped. So `maxAgeMinutes: 999999` passed a green build and the
 * probe could never report that job stale for any reason, which is half of the
 * contract this file's own docblock states.
 *
 * Two ceilings because neither sees the other's shape: a ratio catches a window
 * wildly out of proportion to the cadence, and an absolute catches what a ratio
 * cannot on a rare schedule — six times a monthly gap is 186 days, entirely
 * proportionate and still no alerting for half a year.
 */
describe('checkWindow', () => {
  const DAILY_GAP = 1440;
  const MONTHLY_GAP = 44640;

  it('accepts every window the registry actually ships', () => {
    // The real pairs. If a ceiling is ever tightened past one of these, this
    // reddens before the build does.
    expect(checkWindow('export-worker', 20, 5, '*/5 * * * *')).toBeNull();
    expect(checkWindow('digests', 45, 15, '*/15 * * * *')).toBeNull();
    expect(checkWindow('watchdog', 180, 60, '15 * * * *')).toBeNull();
    expect(checkWindow('lifecycle', 1800, DAILY_GAP, '0 4 * * *')).toBeNull();
    expect(checkWindow('assessments', 46080, MONTHLY_GAP, '0 5 1 * *')).toBeNull();
  });

  it('rejects a window at or under the longest gap — stale between healthy runs', () => {
    expect(checkWindow('j', DAILY_GAP, DAILY_GAP, '0 4 * * *')).toContain('does not exceed');
    expect(checkWindow('j', DAILY_GAP - 1, DAILY_GAP, '0 4 * * *')).toContain('does not exceed');
  });

  it('rejects 999999 — the value that used to pass silently', () => {
    const problem = checkWindow('j', 999999, DAILY_GAP, '0 4 * * *');
    expect(problem).toContain('ceiling');
    // The message has to name the consequence, not just the arithmetic.
    expect(problem).toContain('694 days');
  });

  it('rejects a disproportionate window even when it is short in absolute terms', () => {
    // 200 minutes is nothing on a clock, and 40x the cadence of a 5-minute job.
    expect(checkWindow('j', 200, 5, '*/5 * * * *')).toContain('40.0x');
  });

  it('rejects an absolutely huge window that IS proportionate', () => {
    // 5x a monthly gap clears the ratio ceiling and is still 155 days. This is
    // the case the ratio bound structurally cannot see.
    const problem = checkWindow('j', MONTHLY_GAP * 5, MONTHLY_GAP, '0 5 1 * *');
    expect(problem).toContain('155 days');
    expect(problem).toContain('45-day ceiling');
  });

  it('holds the boundary in both directions', () => {
    // Exactly at each ceiling is allowed; one past is not. Without this the
    // bounds could be off by one in the permissive direction and nothing above
    // would notice.
    expect(checkWindow('j', DAILY_GAP * 6, DAILY_GAP, '0 4 * * *')).toBeNull();
    expect(checkWindow('j', DAILY_GAP * 6 + 1, DAILY_GAP, '0 4 * * *')).toContain('ceiling');
    expect(checkWindow('j', 64800, 10800, '0 5 1 * *')).toBeNull();
    expect(checkWindow('j', 64801, 10801, '0 5 1 * *')).toContain('45-day ceiling');
  });
});
});
