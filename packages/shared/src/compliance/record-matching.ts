/**
 * Which document can fill which checklist record.
 *
 * Every item in `./templates` names a record an association keeps on its website
 * (the declaration, the budget, the meeting minutes...). A posted document can
 * fill one when it sits in a document category the item accepts and its title or
 * its file name says what it is. This module is that table, plus the two
 * questions asked of it:
 *
 * - `matchingTemplateKeys`: which of these items can this document fill?
 * - `proposeTemplateKeyForFile`: which one item does this bare file name point
 *   at, before the file has a title or a category?
 *
 * The answers are evidence, never a decision. A name that fits two items
 * (`Declaration and Bylaws.pdf`) is a question for a person, so a caller that
 * links on its own should act only on exactly one key.
 *
 * ## How text is read
 *
 * Each rule is tried against the text as typed AND against a copy in which every
 * run of `-`, `_`, `.` and whitespace is one space. File names are written with
 * separators (`2025_budget.xlsx`, `By_Laws.pdf`), and `_` is a word character, so
 * `\bbudget\b` and `financial\s+report` cannot see those words as typed; the folded
 * copy can. The text as typed is kept for a pattern that reads a separator itself.
 * None does today (the bylaws patterns accept a hyphen or a space), so the folded
 * copy matches everything the typed text does.
 *
 * ## Insurance
 *
 * Insurance documents have no standard title (a master policy, a flood
 * certificate, a carrier's binder), so for the two insurance items the category
 * is the whole of the evidence and `ANY_TITLE` accepts any title. A file name is
 * therefore no evidence for them, and `proposeTemplateKeyForFile`, which has no
 * category, leaves them out. Without that, every file name would also match the
 * insurance item: a name that fits another item would look ambiguous, and one
 * that fits none would be proposed as insurance.
 *
 * ## Candidates
 *
 * Both functions consider only the keys they are given, in that order, and skip a
 * key that has no rule. The keys are a community's checklist template keys, one
 * row each, so they are distinct.
 *
 * ## Why every pattern is `/i` and nothing else
 *
 * A `g` or `y` flag makes `RegExp.prototype.test` resume from `lastIndex`, so the
 * same question gets a different answer on alternate calls. The patterns below
 * are shared module-level objects and must stay stateless.
 *
 * This package promises it has no import-time side effects (`"sideEffects":
 * false`), so the module only declares constants and functions.
 */

import type { DocumentCategoryKey } from '../document-categories';

export interface RecordMatchRule {
  categoryKeys: readonly DocumentCategoryKey[];
  title: RegExp;
}

export interface MatchableDocument {
  title: string;
  fileName: string;
  categoryKey: DocumentCategoryKey;
}

/**
 * Matches any text at all, the empty string included. A rule built on it is
 * decided by its category alone.
 *
 * Rules are recognised by IDENTITY (`rule.title === ANY_TITLE`), so every rule
 * that means "any title" must use this one object: a lookalike regex is an
 * ordinary pattern as far as `proposeTemplateKeyForFile` is concerned.
 */
const ANY_TITLE = /[\s\S]*/i;

// Patterns that a condominium item and its association twin read the same way.
const ARTICLES = /\barticles\b/i;
const BUDGET = /\bbudget\b/i;
const FINANCIAL_REPORT = /financial\s+(report|statement)s?|\baudit(ed)?\b|\bcompilation\b|review\s+report/i;
const MINUTES = /\bminutes\b/i;
// Meeting-record words take a plural, since a file often holds a batch: "Meeting Notices.pdf".
const MEETING_NOTICES = /\bnotices?\b|\bagendas?\b/i;
const BIDS = /\bbids?\b/i;

/**
 * One rule per checklist template key in `./templates`, for both community types
 * (a unit test fails when a template key has no rule here, or the reverse).
 * The twins `718_x` / `720_x` share a pattern, so the two chapters cannot drift.
 */
export const RECORD_MATCH_RULES: Readonly<Record<string, RecordMatchRule>> = {
  '718_declaration': { categoryKeys: ['declaration'], title: /\bdeclaration\b/i },
  // A hyphen or a space between "by" and "laws": "By-Laws", "By Laws", and the "By_Laws" and
  // "By-Laws_2019" that fold to "By Laws". The chapter 720 item below accepts the same.
  '718_bylaws': { categoryKeys: ['declaration'], title: /\bby[-\s]?laws?\b/i },
  '718_articles': { categoryKeys: ['declaration'], title: ARTICLES },
  '720_articles': { categoryKeys: ['declaration'], title: ARTICLES },
  '718_rules': { categoryKeys: ['declaration', 'rules'], title: /\brules?\b|\bregulations?\b/i },
  '718_qa_sheet': { categoryKeys: ['declaration'], title: /question.{0,6}answer|\bq\s*&\s*a\b/i },
  '718_budget': { categoryKeys: ['financial_records'], title: BUDGET },
  '720_budget': { categoryKeys: ['financial_records'], title: BUDGET },
  '718_financial_report': { categoryKeys: ['financial_records'], title: FINANCIAL_REPORT },
  '720_financial_report': { categoryKeys: ['financial_records'], title: FINANCIAL_REPORT },
  '718_minutes_rolling_12m': { categoryKeys: ['meeting_minutes'], title: MINUTES },
  '720_minutes_rolling_12m': { categoryKeys: ['meeting_minutes'], title: MINUTES },
  // A plural too, as with MEETING_NOTICES: "Board Meeting Recordings".
  '718_video_recordings': { categoryKeys: ['meeting_minutes'], title: /\brecordings?\b|\bvideos?\b/i },
  '718_meeting_notices': { categoryKeys: ['meeting_minutes'], title: MEETING_NOTICES },
  '720_meeting_notices': { categoryKeys: ['meeting_minutes'], title: MEETING_NOTICES },
  '718_affidavits': { categoryKeys: ['declaration', 'meeting_minutes'], title: /\baffidavit/i },
  '718_insurance': { categoryKeys: ['insurance'], title: ANY_TITLE },
  '720_insurance': { categoryKeys: ['insurance'], title: ANY_TITLE },
  '718_contracts': { categoryKeys: ['contracts'], title: /list\s+of\s+(executory\s+)?contracts|contracts?\s+list/i },
  '718_conflict_contracts': { categoryKeys: ['contracts'], title: /conflict\s+of\s+interest/i },
  '718_bids': { categoryKeys: ['contracts'], title: BIDS },
  '720_bids': { categoryKeys: ['contracts'], title: BIDS },
  '718_inspection_reports': { categoryKeys: ['inspection_reports'], title: /milestone|structural\s+inspection/i },
  '718_sirs': { categoryKeys: ['inspection_reports'], title: /reserve\s+study|\bsirs\b/i },
  // Chapter 720 only: its own wording for the governing documents and contracts.
  '720_governing_docs': { categoryKeys: ['declaration'], title: /declaration|covenants/i },
  '720_bylaws_rules': { categoryKeys: ['declaration', 'rules'], title: /by[-\s]?laws?|\brules?\b|regulations?/i },
  '720_contracts': { categoryKeys: ['contracts'], title: /\bcontract/i },
};

/** A run of these is the gap between two words in a file name: `2025_budget.xlsx`. */
const SEPARATOR_RUN = /[-_.\s]+/;

/**
 * Each text as typed, then again with every separator run folded to one space.
 * Split and join rather than a global replace, so no regex here carries a `g` flag.
 */
function readings(...texts: string[]): string[] {
  return texts.flatMap((text) => [text, text.split(SEPARATOR_RUN).join(' ')]);
}

function ruleFor(key: string): RecordMatchRule | undefined {
  // Own keys only: `constructor` and `toString` are inherited names, not rules.
  return Object.prototype.hasOwnProperty.call(RECORD_MATCH_RULES, key)
    ? RECORD_MATCH_RULES[key]
    : undefined;
}

/**
 * The candidate items this document can fill, in the order the candidates are
 * given. An item qualifies when the document's category is one it accepts AND the
 * title or the file name matches its pattern.
 *
 * More than one key back means the document fits several items; choosing between
 * them is for a person.
 */
export function matchingTemplateKeys(
  doc: MatchableDocument,
  candidateKeys: readonly string[],
): string[] {
  const texts = readings(doc.title, doc.fileName);
  const matches: string[] = [];
  for (const key of candidateKeys) {
    const rule = ruleFor(key);
    if (rule === undefined || !rule.categoryKeys.includes(doc.categoryKey)) continue;
    if (texts.some((text) => rule.title.test(text))) matches.push(key);
  }
  return matches;
}

/**
 * The one candidate item a bare file name points at, or null when it points at
 * none or at several. With no category to go on only the file name is read, and
 * the any-title items are left out: a file name is no evidence for them.
 */
export function proposeTemplateKeyForFile(
  fileName: string,
  candidateKeys: readonly string[],
): string | null {
  const texts = readings(fileName);
  let proposal: string | null = null;
  for (const key of candidateKeys) {
    const rule = ruleFor(key);
    if (rule === undefined || rule.title === ANY_TITLE) continue;
    if (!texts.some((text) => rule.title.test(text))) continue;
    if (proposal !== null) return null; // a second item fits, so the name is ambiguous
    proposal = key;
  }
  return proposal;
}
