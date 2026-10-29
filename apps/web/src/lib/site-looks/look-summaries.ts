/**
 * The four looks' names and one-line descriptions, and nothing else.
 *
 * `LOOKS` (`./looks`) is the registry of record, and it carries each look's
 * default sections and the block schemas and switch planner behind them. A list
 * of looks that only shows names (the look picker and the website home) should
 * not import all that, so this module repeats just the part a list needs.
 *
 * A copy needs a test that ties it to the original: `look-summaries.test.ts`
 * compares every id, name and description with `LOOKS`, in order, and checks that
 * this file imports nothing at run time. Change a look's wording in `looks.ts`
 * (and migration 0097's catalog rows, which `looks.test.ts` compares it with)
 * and here together.
 *
 * Type imports only: the compiler erases them, so this stays dependency-free.
 */
import type { LookId } from './looks';

export interface LookSummary {
  /** The look's id, which is also its layout id and its colour set's slug (D2). */
  id: LookId;
  name: string;
  /** One line about the look. */
  description: string;
}

export const LOOK_SUMMARIES: readonly LookSummary[] = [
  { id: 'bayfront', name: 'Bayfront', description: 'Photo-led and modern.' },
  { id: 'heritage', name: 'Heritage', description: 'Formal and official.' },
  { id: 'palm-grove', name: 'Palm Grove', description: 'Warm and friendly.' },
  { id: 'plain-simple', name: 'Plain & Simple', description: 'No photos needed, larger text.' },
];
