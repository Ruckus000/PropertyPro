/**
 * Linked fields: tokens in site copy that stand for a fact the community has
 * already given us, so a rename in Settings shows on the site with no republish.
 *
 * Copy such as "Welcome to {{name}}" is stored with the token and resolved when
 * the page is rendered. This is the one definition of what a token is and how it
 * resolves, shared so the public site, the editor's preview and the editor's
 * token chips cannot disagree.
 *
 *   {{name}}   the short name when it is not blank, else the full name
 *   {{city}}   the city
 *   {{units}}  the unit count, only for a positive whole number, written with
 *              thousands separators ("1,200")
 *
 * Four rules, each there for a reason:
 *
 *   1. A missing fact drops its SENTENCE. Dropping only the token would leave
 *      "homes in ." on a public page; dropping the whole text would lose the
 *      sentences that were fine. A fact is missing when it is null or blank
 *      after trimming. A sentence ends at `.`, `!` or `?` followed by whitespace.
 *   2. The drop is decided on the TEMPLATE, before any value goes in. So a name
 *      such as "Harbor Pointe Condo. Assn." cannot split a sentence in two or
 *      make half of one disappear.
 *   3. Values are inserted as text, with the whitespace around them trimmed, and
 *      never looked at again. A name containing "{{city}}", markup or "$&" is
 *      shown exactly as typed.
 *   4. A full stop is not doubled. A value that ends in one (the full name
 *      "Harbor Pointe Condominium Association, Inc.") takes the "." that follows
 *      its token in the template as its own, so "{{name}}." ends in "Inc." and not
 *      "Inc..", and "{{name}}..." ends in "Inc..." (three dots in all). The value
 *      itself is never changed.
 *
 * Anything else in double braces ("{{phone}}") is not a token and is left as
 * written.
 *
 * Known limit: there is no list of abbreviations, so a full stop after one ends a
 * sentence like any other. "Dr. Smith Condominium: {{units}} homes." with the unit
 * count unknown becomes "Dr.", because "Dr." stands as a sentence of its own.
 */

export const LINKED_FIELDS = ['name', 'city', 'units'] as const;
export type LinkedField = (typeof LINKED_FIELDS)[number];

/** The community facts a token can stand for. */
export interface LinkedFacts {
  /** Full name. Always set on a community, but treated as missing if it is blank. */
  name: string;
  /** Everyday name ("Harbor Pointe"). `{{name}}` prefers it when it is not blank. */
  shortName: string | null;
  city: string | null;
  /** Only a positive whole number resolves `{{units}}`; null means not known. */
  unitCount: number | null;
}

export type LinkedSegment =
  | { kind: 'text'; value: string }
  | { kind: 'field'; field: LinkedField };

/**
 * What each token stands for, or null when that fact is missing. A Record over
 * LinkedField, so a token cannot be added to the list without a resolver. Text
 * comes back trimmed, the same way "blank" is judged.
 */
const RESOLVERS: Record<LinkedField, (facts: LinkedFacts) => string | null> = {
  name: ({ shortName, name }) => trimmedOrNull(shortName) ?? trimmedOrNull(name),
  city: ({ city }) => trimmedOrNull(city),
  units: ({ unitCount }) => {
    if (unitCount === null || !Number.isInteger(unitCount) || unitCount <= 0) return null;
    // An explicit locale, so the server and the browser print the same digits.
    return unitCount.toLocaleString('en-US');
  },
};

/** The value without the whitespace around it, or null when that leaves nothing. */
function trimmedOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function isLinkedField(value: string | undefined): value is LinkedField {
  return LINKED_FIELDS.some((field) => field === value);
}

/** A fresh pattern per call: a shared `g` regex would carry `lastIndex` between uses. */
function tokenPattern(): RegExp {
  return new RegExp(`\\{\\{(${LINKED_FIELDS.join('|')})\\}\\}`, 'g');
}

/**
 * Splits text into sentences, each keeping the whitespace that followed it, so
 * the pieces joined give the text back. The last one runs to the end of the text.
 */
function splitSentences(text: string): string[] {
  return text.match(/[\s\S]*?[.!?]\s+|[\s\S]+/g) ?? [];
}

/**
 * `text` as an ordered list of plain-text runs and tokens, for showing tokens as
 * chips. Joining the segments back (text values as they are, a field as
 * `{{field}}`) gives `text` exactly. Unknown tokens stay inside text runs, and no
 * text run is empty or follows another.
 */
export function parseLinkedText(text: string): LinkedSegment[] {
  const segments: LinkedSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(tokenPattern())) {
    const field = match[1];
    // The pattern only captures LINKED_FIELDS; if that ever failed, the match
    // would stay in the surrounding text run.
    if (!isLinkedField(field)) continue;

    if (match.index > cursor) {
      segments.push({ kind: 'text', value: text.slice(cursor, match.index) });
    }
    segments.push({ kind: 'field', field });
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) segments.push({ kind: 'text', value: text.slice(cursor) });
  return segments;
}

/** The sentence with its tokens replaced, or null if any token's fact is missing. */
function resolveSentence(sentence: string, facts: LinkedFacts): string | null {
  let resolved = '';
  let endsInStop = false; // the last thing written is a value that ends in "."

  for (const segment of parseLinkedText(sentence)) {
    if (segment.kind === 'text') {
      let text = segment.value;
      // The value's own full stop is already there: writing the template's one too
      // would give "Inc..". Giving up one of the template's keeps an ellipsis at three.
      if (endsInStop && text.startsWith('.')) text = text.slice(1);
      resolved += text;
      endsInStop = false;
      continue;
    }
    const value = RESOLVERS[segment.field](facts);
    if (value === null) return null;
    // Appended to the output only, so a value is never read as a token again.
    resolved += value;
    endsInStop = value.endsWith('.');
  }

  return resolved;
}

/**
 * `text` with its tokens replaced by `facts`. A sentence holding a token whose
 * fact is missing is dropped whole; the sentences that stay keep their wording
 * and the spacing that followed them. Returns '' when nothing is left.
 */
export function resolveLinkedText(text: string, facts: LinkedFacts): string {
  const kept: string[] = [];

  for (const sentence of splitSentences(text)) {
    const resolved = resolveSentence(sentence, facts);
    if (resolved !== null) kept.push(resolved);
  }

  return kept.join('').trim();
}

/**
 * The hero's headline as the page shows it: `text` resolved, and, when nothing is
 * left of it, the community's display name (the short name when it is not blank,
 * else the full name, which is what `{{name}}` stands for).
 *
 * A hero always has a heading: the layouts skip their own empty-state hero whenever
 * a hero block validates, so this is the page's only one. A headline that drops
 * whole, say `{{city}}` for a community with no city, therefore shows the name
 * rather than nothing. The public page and the editor's "Shows as" line both call
 * this, so what the editor says the page shows is what the page shows.
 *
 * The result is empty only when the name itself is blank.
 */
export function resolveHeroHeadline(text: string, facts: LinkedFacts): string {
  return resolveLinkedText(text, facts) || resolveLinkedText('{{name}}', facts);
}
