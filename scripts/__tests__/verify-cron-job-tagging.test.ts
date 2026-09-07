import { describe, expect, it } from 'vitest';

import { analyzeRoute, maxIntervalMinutes, slugForPath } from '../verify-cron-job-tagging';

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
});
