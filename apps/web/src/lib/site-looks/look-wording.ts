/**
 * The welcome words each look starts with, and nothing else.
 *
 * The hero form offers "Use the look's wording", which puts a look's headline
 * and subtitle back. `LOOKS` (`./looks`) holds those words, but it also holds
 * every default section and, behind them, the block schemas and the switch
 * planner: a form that only needs two strings should not carry all that into
 * its chunk, so this module repeats just the part the form reads.
 *
 * A copy needs a test that ties it to the original: `look-wording.test.ts`
 * compares every headline and subtitle with the hero section in `LOOKS`, checks
 * that a layout maps to a look exactly as `lookIdForLayout` says, and checks
 * that this file imports nothing at run time. Change a look's welcome words in
 * `looks.ts` and here together.
 *
 * Type imports only: the compiler erases them, so this stays dependency-free.
 */
import type { LookId } from './looks';

export interface LookHeroWording {
  /** The look's name, as the picker shows it. */
  lookName: string;
  /** Linked-field words (D4), as stored: the tokens are kept, not resolved. */
  headline: string;
  subtitle: string;
}

const HERO_WORDING: Readonly<Record<LookId, LookHeroWording>> = {
  bayfront: {
    lookName: 'Bayfront',
    headline: 'Welcome to {{name}}',
    subtitle:
      '{{units}} homes in {{city}}. Meeting notices, news and community records, all in one place.',
  },
  heritage: {
    lookName: 'Heritage',
    headline: '{{name}}',
    subtitle: 'The website of {{name}}. Notices, meetings and records for owners and residents.',
  },
  'palm-grove': {
    lookName: 'Palm Grove',
    headline: 'Welcome home to {{name}}',
    subtitle:
      'News, meetings and everyday information for our neighbors. {{units}} homes in {{city}}.',
  },
  'plain-simple': {
    lookName: 'Plain & Simple',
    headline: 'Welcome to {{name}}',
    subtitle: 'Meeting notices, news and community records, in one place.',
  },
};

/**
 * The welcome words of the look this layout draws, or null for a legacy layout
 * (tidewater, boulevard, sable) or none: those have no look, so nothing to go
 * back to. Keyed on the layout alone, the way `lookIdForLayout` is.
 */
export function heroWordingForLayout(layoutId: string | null | undefined): LookHeroWording | null {
  if (typeof layoutId !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(HERO_WORDING, layoutId)
    ? HERO_WORDING[layoutId as LookId]
    : null;
}
