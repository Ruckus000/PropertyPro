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
 * links on its own should act only on exactly one key. Exactly one key is
 * necessary for that, not sufficient: the rules read words, and a paper that
 * shares a record's words can still pass them (`Required By Laws of Florida.pdf`
 * reads as bylaws). A caller has two more brakes: it links only when the item has
 * exactly one candidate document, and it records automatic links so they can be
 * seen and undone.
 *
 * ## How text is read
 *
 * Each rule is tried against the text as typed AND against a copy in which every
 * run of `-`, `_`, `.` and whitespace is one space. File names are written with
 * separators (`2025_budget.xlsx`, `By_Laws.pdf`), and `_` is a word character, so
 * `\bbudget\b` and `financial\s+report` cannot see those words as typed; the folded
 * copy can. But the text as typed is the only one in which `By-Law` (one bylaw,
 * hyphenated) still has the hyphen that `by-?laws?` reads: folded it is `By Law`.
 *
 * ## Vetoes
 *
 * A title pattern says what a record is called, and papers ABOUT a record carry its
 * words: the minutes of the audit committee, a budget workshop notice, draft
 * minutes, an invitation to bid, a proposal for a reserve study. So a rule can also
 * carry an `exclude` pattern, a veto. It fits only when its title pattern matches
 * some reading AND its veto matches none. The veto reads what the title pattern
 * reads: for a document, the title and the file name, so a veto word in either
 * removes the item (`2026 Budget`, filed as `2026-budget-workshop-notice.pdf`); for
 * a bare file name, the file name. The meeting notices take no veto (notices and
 * agendas are what they are), nor do the affidavits (an affidavit of mailing a
 * notice is a real affidavit) or the list of contracts. The chapter 720 contracts
 * item is narrowed instead, to the whole words `contract` and `contracts`, so
 * `Contractor ...` is not a contract.
 *
 * ## Insurance
 *
 * Insurance documents have no standard title (a master policy, a flood
 * certificate, a carrier's binder), so for the two insurance items the category
 * is the whole of the evidence and `ANY_TITLE` accepts any title. A file name is
 * therefore no evidence for them, and `proposeTemplateKeyForFile`, which has no
 * category, leaves them out. Without that, every file name would also match the
 * insurance item: a name that fits another item would look ambiguous, and one
 * that fits none would be proposed as insurance. Their veto (invoices, claims,
 * quotes, committee papers) is all that keeps a bill in the insurance folder from
 * filling the policy item.
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
 * same question gets a different answer on alternate calls. The patterns below,
 * vetoes included, are shared module-level objects and must stay stateless.
 *
 * This package promises it has no import-time side effects (`"sideEffects":
 * false`), so the module only declares constants and functions.
 */

import type { DocumentCategoryKey } from '../document-categories';

export interface RecordMatchRule {
  categoryKeys: readonly DocumentCategoryKey[];
  title: RegExp;
  /**
   * A veto: words that make a document ABOUT this record rather than the record. The rule
   * fits only when `title` matches some reading of the text and `exclude` matches none.
   */
  exclude?: RegExp;
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

// Vetoes (see "Vetoes" above). Each is defined once and shared by every item that uses it.
// Committee and meeting papers about a governing document: the committee that drafts the rules, the
// notice of a vote on the declaration.
const VETO_GOVERNING_DOCUMENT = /\b(?:committees?|agendas?|minutes|notices?)\b/i;
// ... and the budget's own working papers: a workshop, budget against actual, a variance report.
const VETO_BUDGET = /\b(?:committees?|agendas?|minutes|notices?|workshops?|vs|versus|actuals?|variance)\b/i;
// ... and the paperwork around an audit that is not the report: a waiver ballot, an engagement letter.
const VETO_FINANCIAL_REPORT = /\b(?:committees?|agendas?|minutes|notices?|waivers?|waive|ballots?|engagement|proposals?)\b/i;
// Minutes are the record once approved: a draft, unapproved or proposed set is not yet.
const VETO_MINUTES = /\b(?:drafts?|unapproved|proposed)\b/i;
// Bids RECEIVED are the record; the invitation, request or notice that asked for them is not.
const VETO_BIDS = /\b(?:invitations?|requests?|solicitations?|rfps?|rfqs?|itbs?|notices?|agendas?)\b/i;
// Insurance is decided by category alone, so bills, claims and quotes filed beside the policy are stopped here.
const VETO_INSURANCE = /\b(?:committees?|agendas?|minutes|notices?|invoices?|quotes?|proposals?|claims?|bills?)\b/i;
// What leads to or bills for an inspection or a study (proposal, quote, bid, contract) is not its report.
const VETO_INSPECTION = /\b(?:proposals?|quotes?|bids?|invoices?|rfps?|contracts?|notices?)\b/i;
// A conflict-of-interest policy is not a contract that creates a conflict.
const VETO_CONFLICT = /\bpolic(?:y|ies)\b/i;
// A receipt or a fee for a recording is not the recording.
const VETO_RECORDING = /\b(?:receipts?|fees?)\b/i;

/**
 * One rule per checklist template key in `./templates`, for both community types
 * (a unit test fails when a template key has no rule here, or the reverse).
 * The twins `718_x` / `720_x` share a pattern, so the two chapters cannot drift.
 */
export const RECORD_MATCH_RULES: Readonly<Record<string, RecordMatchRule>> = {
  '718_declaration': { categoryKeys: ['declaration'], title: /\bdeclaration\b/i, exclude: VETO_GOVERNING_DOCUMENT },
  // "Bylaws", "By-Laws", "By-Law", and "By Laws" with a space, which is also what "By_Laws" and
  // "By-Laws_2019" fold to. The spaced form needs the plural, so "Required by Law" and
  // "Required_by_Law" are not read as bylaws. A hyphen reads in either number, because real amendment
  // titles say "By-Law": so "Required-by-Law" is read, and that is accepted. The chapter 720 item
  // below reads the same names.
  '718_bylaws': { categoryKeys: ['declaration'], title: /\bby-?laws?\b|\bby\s+laws\b/i, exclude: VETO_GOVERNING_DOCUMENT },
  '718_articles': { categoryKeys: ['declaration'], title: ARTICLES, exclude: VETO_GOVERNING_DOCUMENT },
  '720_articles': { categoryKeys: ['declaration'], title: ARTICLES, exclude: VETO_GOVERNING_DOCUMENT },
  '718_rules': { categoryKeys: ['declaration', 'rules'], title: /\brules?\b|\bregulations?\b/i, exclude: VETO_GOVERNING_DOCUMENT },
  '718_qa_sheet': { categoryKeys: ['declaration'], title: /question.{0,6}answer|\bq\s*&\s*a\b/i, exclude: VETO_GOVERNING_DOCUMENT },
  '718_budget': { categoryKeys: ['financial_records'], title: BUDGET, exclude: VETO_BUDGET },
  '720_budget': { categoryKeys: ['financial_records'], title: BUDGET, exclude: VETO_BUDGET },
  '718_financial_report': { categoryKeys: ['financial_records'], title: FINANCIAL_REPORT, exclude: VETO_FINANCIAL_REPORT },
  '720_financial_report': { categoryKeys: ['financial_records'], title: FINANCIAL_REPORT, exclude: VETO_FINANCIAL_REPORT },
  '718_minutes_rolling_12m': { categoryKeys: ['meeting_minutes'], title: MINUTES, exclude: VETO_MINUTES },
  '720_minutes_rolling_12m': { categoryKeys: ['meeting_minutes'], title: MINUTES, exclude: VETO_MINUTES },
  // A plural too, as with MEETING_NOTICES: "Board Meeting Recordings".
  '718_video_recordings': { categoryKeys: ['meeting_minutes'], title: /\brecordings?\b|\bvideos?\b/i, exclude: VETO_RECORDING },
  '718_meeting_notices': { categoryKeys: ['meeting_minutes'], title: MEETING_NOTICES },
  '720_meeting_notices': { categoryKeys: ['meeting_minutes'], title: MEETING_NOTICES },
  '718_affidavits': { categoryKeys: ['declaration', 'meeting_minutes'], title: /\baffidavit/i },
  '718_insurance': { categoryKeys: ['insurance'], title: ANY_TITLE, exclude: VETO_INSURANCE },
  '720_insurance': { categoryKeys: ['insurance'], title: ANY_TITLE, exclude: VETO_INSURANCE },
  '718_contracts': { categoryKeys: ['contracts'], title: /list\s+of\s+(executory\s+)?contracts|contracts?\s+list/i },
  '718_conflict_contracts': { categoryKeys: ['contracts'], title: /conflict\s+of\s+interest/i, exclude: VETO_CONFLICT },
  '718_bids': { categoryKeys: ['contracts'], title: BIDS, exclude: VETO_BIDS },
  '720_bids': { categoryKeys: ['contracts'], title: BIDS, exclude: VETO_BIDS },
  '718_inspection_reports': { categoryKeys: ['inspection_reports'], title: /milestone|structural\s+inspection/i, exclude: VETO_INSPECTION },
  '718_sirs': { categoryKeys: ['inspection_reports'], title: /reserve\s+study|\bsirs\b/i, exclude: VETO_INSPECTION },
  // Chapter 720 only: its own wording for the governing documents and contracts.
  '720_governing_docs': { categoryKeys: ['declaration'], title: /declaration|covenants/i, exclude: VETO_GOVERNING_DOCUMENT },
  // The spaced "by laws" starts at a word boundary, so "Standby Laws" is not read as bylaws. The first
  // form has no leading \b, as in the brief, so "Standby-Laws" and "Standbylaws" still are.
  '720_bylaws_rules': { categoryKeys: ['declaration', 'rules'], title: /by-?laws?|\bby\s+laws\b|\brules?\b|regulations?/i, exclude: VETO_GOVERNING_DOCUMENT },
  // Whole words only: "Contractor Insurance Certificate" is not a contract.
  '720_contracts': { categoryKeys: ['contracts'], title: /\bcontracts?\b/i },
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
 * Whether the rule fits the text: its title pattern matches some reading, and its veto,
 * if it has one, matches none.
 */
function reads(rule: RecordMatchRule, texts: readonly string[]): boolean {
  const veto = rule.exclude;
  if (veto !== undefined && texts.some((text) => veto.test(text))) return false;
  return texts.some((text) => rule.title.test(text));
}

/**
 * The candidate items this document can fill, in the order the candidates are
 * given. An item qualifies when the document's category is one it accepts, its
 * title or its file name matches its pattern, AND neither trips its veto.
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
    if (reads(rule, texts)) matches.push(key);
  }
  return matches;
}

/**
 * The one candidate item a bare file name points at, or null when it points at
 * none or at several. With no category to go on only the file name is read, a veto
 * word in it removes an item, and the any-title items are left out: a file name is
 * no evidence for them.
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
    if (!reads(rule, texts)) continue;
    if (proposal !== null) return null; // a second item fits, so the name is ambiguous
    proposal = key;
  }
  return proposal;
}
