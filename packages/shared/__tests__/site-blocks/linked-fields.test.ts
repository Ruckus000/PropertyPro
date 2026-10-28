/**
 * Linked fields: the `{{name}}`, `{{city}}` and `{{units}}` tokens that site
 * copy can carry, so a sign-up fact shows on the site without anyone retyping it.
 *
 * Three behaviours carry the weight, and each has tests that fail without it:
 *   - A missing fact removes ONE sentence. Never the whole text, and never half a
 *     sentence ("homes in ." is the failure this prevents).
 *   - Values are data. A community named "{{city}}" or "<b>" shows as typed, less
 *     the whitespace around it: nothing in a value is split into sentences,
 *     scanned for tokens or interpreted.
 *   - A full stop is never doubled. The full name usually ends in "Inc.", and
 *     copy such as "Welcome to {{name}}." must not read "Inc..".
 */
import { describe, it, expect } from 'vitest';
import {
  LINKED_FIELDS,
  parseLinkedText,
  resolveLinkedText,
  type LinkedFacts,
  type LinkedField,
} from '../../src/site-blocks/linked-fields';
import * as shared from '../../src/index';

const FULL_NAME = 'Harbor Pointe Condominium Association, Inc.';

/** A community with only its full name known; each test sets what it needs. */
function facts(overrides: Partial<LinkedFacts> = {}): LinkedFacts {
  return { name: FULL_NAME, shortName: null, city: null, unitCount: null, ...overrides };
}

describe('linked fields', () => {
  // The contract: the cases the plan names.

  it('uses the short name for {{name}} when set', () => {
    expect(
      resolveLinkedText('Welcome to {{name}}', {
        name: 'Harbor Pointe Condominium Association, Inc.',
        shortName: 'Harbor Pointe',
        city: null,
        unitCount: null,
      }),
    ).toBe('Welcome to Harbor Pointe');
  });

  it('falls back to the full name', () => {
    expect(resolveLinkedText('Welcome to {{name}}', facts())).toBe(`Welcome to ${FULL_NAME}`);
  });

  it('drops only the sentence whose fact is missing', () => {
    const text = '{{units}} homes in {{city}}. News and records, all in one place.';
    const rest = 'News and records, all in one place.';

    // The unit count is unknown, so the first sentence goes (city known or not).
    expect(resolveLinkedText(text, facts({ city: 'Miami', unitCount: null }))).toBe(rest);
    expect(resolveLinkedText(text, facts({ city: null, unitCount: null }))).toBe(rest);
    // The fact that IS known does not rescue the sentence that lacks the other.
    expect(resolveLinkedText(text, facts({ city: null, unitCount: 120 }))).toBe(rest);
    // With both facts the sentence stays whole.
    expect(resolveLinkedText(text, facts({ city: 'Miami', unitCount: 120 }))).toBe(
      '120 homes in Miami. News and records, all in one place.',
    );
  });

  it('treats a unit count of 0 as missing', () => {
    const text = '{{units}} homes in {{city}}. News and records, all in one place.';

    expect(resolveLinkedText(text, facts({ city: 'Miami', unitCount: 0 }))).toBe(
      'News and records, all in one place.',
    );
    // Control: any positive count resolves, so the 0 above is what dropped it.
    expect(resolveLinkedText(text, facts({ city: 'Miami', unitCount: 2 }))).toBe(
      '2 homes in Miami. News and records, all in one place.',
    );
  });

  it('inserts values literally and never re-resolves them', () => {
    const out = resolveLinkedText(
      'Welcome to {{name}}. Based in {{city}}.',
      facts({ name: 'Pointe {{city}} <b>', city: 'Miami' }),
    );

    expect(out).toContain('Pointe {{city}} <b>');
    expect(out).toBe('Welcome to Pointe {{city}} <b>. Based in Miami.');
  });

  it('leaves unknown tokens as written', () => {
    expect(resolveLinkedText('{{phone}}', facts())).toBe('{{phone}}');
  });

  it('returns an empty string when every sentence drops', () => {
    const text = '{{units}} homes in {{city}}. {{name}} welcomes you to {{city}}!';

    expect(resolveLinkedText(text, facts())).toBe('');
    expect(resolveLinkedText('{{city}}', facts())).toBe('');
    expect(resolveLinkedText('', facts())).toBe('');
  });

  it('parseLinkedText splits text and fields', () => {
    expect(parseLinkedText('Hi {{name}}!')).toEqual([
      { kind: 'text', value: 'Hi ' },
      { kind: 'field', field: 'name' },
      { kind: 'text', value: '!' },
    ]);
  });

  // What counts as a missing fact, and how the unit count is written.

  it('treats facts that are blank after trimming as missing', () => {
    const text = 'In {{city}}. Welcome.';

    expect(resolveLinkedText(text, facts({ city: '' }))).toBe('Welcome.');
    expect(resolveLinkedText(text, facts({ city: '   ' }))).toBe('Welcome.');
    expect(resolveLinkedText(text, facts({ city: '\n\t' }))).toBe('Welcome.');
  });

  it('falls back to the full name when the short name is blank', () => {
    expect(resolveLinkedText('Hi {{name}}', facts({ shortName: '' }))).toBe(`Hi ${FULL_NAME}`);
    expect(resolveLinkedText('Hi {{name}}', facts({ shortName: '   ' }))).toBe(`Hi ${FULL_NAME}`);
  });

  it('drops the {{name}} sentence when both names are blank', () => {
    expect(
      resolveLinkedText('Welcome to {{name}}. News.', facts({ name: '  ', shortName: ' ' })),
    ).toBe('News.');
  });

  it('trims the whitespace around an inserted value', () => {
    // Mid-sentence, where the final trim of the result cannot help: "In  Miami ."
    // is the failure this prevents.
    expect(resolveLinkedText('In {{city}}.', facts({ city: ' Miami ' }))).toBe('In Miami.');
    expect(resolveLinkedText('In {{city}}, FL.', facts({ city: '\n\tMiami\n' }))).toBe(
      'In Miami, FL.',
    );
    // Both names, and only their ends: spacing inside a name is the manager's own.
    expect(resolveLinkedText('Hi {{name}}.', facts({ shortName: '\n Harbor Pointe\t' }))).toBe(
      'Hi Harbor Pointe.',
    );
    expect(resolveLinkedText('Hi {{name}}!', facts({ name: '  Harbor  Pointe ' }))).toBe(
      'Hi Harbor  Pointe!',
    );
  });

  it('writes the unit count with thousands separators', () => {
    expect(resolveLinkedText('{{units}} homes', facts({ unitCount: 1200 }))).toBe('1,200 homes');
    expect(resolveLinkedText('{{units}} homes', facts({ unitCount: 120 }))).toBe('120 homes');
  });

  it.each([12.5, -3, Number.NaN, Number.POSITIVE_INFINITY])(
    'treats a unit count of %s as missing',
    (unitCount) => {
      expect(resolveLinkedText('{{units}} homes. Come visit.', facts({ unitCount }))).toBe(
        'Come visit.',
      );
    },
  );

  // Where one sentence ends and the next begins.

  it('drops a sentence when any one of its tokens is missing', () => {
    expect(
      resolveLinkedText(
        '{{name}} has {{units}} homes. Come visit.',
        facts({ shortName: 'Harbor Pointe' }),
      ),
    ).toBe('Come visit.');
  });

  it('ends a sentence at ".", "!" or "?" followed by whitespace', () => {
    const text = 'Hello {{city}}! Why {{units}}? Because {{name}}. Done.';

    // City and units are missing, so the first two sentences go.
    expect(resolveLinkedText(text, facts({ shortName: 'Harbor Pointe' }))).toBe(
      'Because Harbor Pointe. Done.',
    );
  });

  it.each(['.', '!', '?'])('ends a sentence at "%s" followed by whitespace', (stop) => {
    // The mixed text above cannot tell the terminators apart: the sentence ending
    // in "!" holds a missing fact and drops whether or not "!" ends it. Alone, the
    // sentence after the stop survives only if the stop really ended the one before.
    expect(resolveLinkedText(`Hello {{city}}${stop} Welcome.`, facts())).toBe('Welcome.');
  });

  it('also ends a sentence after an abbreviation, a known limit', () => {
    // There is no list of abbreviations, so "Dr." is a sentence of its own: it stays
    // while the rest of the line drops. The module docblock states this limit.
    expect(resolveLinkedText('Dr. Smith Condominium: {{units}} homes.', facts())).toBe('Dr.');
  });

  it('does not end a sentence at punctuation that is not followed by whitespace', () => {
    // "9.30" and "5.00" must not split the sentence; if they did, only the tail
    // "00 in {{city}}." would drop and "Open 9.30 to 5." would be left behind.
    expect(resolveLinkedText('Open 9.30 to 5.00 in {{city}}. Welcome.', facts())).toBe('Welcome.');
  });

  it('keeps the separator that followed each kept sentence', () => {
    expect(resolveLinkedText('First.\nSecond in {{city}}.\nThird.', facts())).toBe('First.\nThird.');
    expect(resolveLinkedText('Hello.  World.', facts())).toBe('Hello.  World.');
  });

  it('trims the result, with no stray separator when an end sentence drops', () => {
    expect(resolveLinkedText('Hi {{city}}.   Welcome.', facts())).toBe('Welcome.');
    expect(resolveLinkedText('Welcome.   Hi {{city}}.', facts())).toBe('Welcome.');
    expect(
      resolveLinkedText('  Welcome to {{name}}.  ', facts({ shortName: 'Harbor Pointe' })),
    ).toBe('Welcome to Harbor Pointe.');
  });

  // A value that ends in a full stop ("..., Inc.") meeting the template's own.

  it('shows one full stop where a name ending in one meets the template full stop', () => {
    // The plan's heritage subtitle. With no short name the value is the full name,
    // which ends in "Inc.", so the template's full stop must not be written again.
    expect(
      resolveLinkedText(
        'The website of {{name}}. Notices, meetings and records for owners and residents.',
        facts(),
      ),
    ).toBe(
      'The website of Harbor Pointe Condominium Association, Inc. Notices, meetings and records for owners and residents.',
    );
  });

  it('shows one full stop when the name ends the text', () => {
    expect(resolveLinkedText('Welcome to {{name}}.', facts())).toBe(`Welcome to ${FULL_NAME}`);
    // Every occurrence, each sentence on its own.
    expect(resolveLinkedText('{{name}}. Again, {{name}}.', facts())).toBe(
      `${FULL_NAME} Again, ${FULL_NAME}`,
    );
    // The value is judged as inserted, so a stray space after its full stop does not defeat it.
    expect(resolveLinkedText('Welcome to {{name}}.', facts({ name: `${FULL_NAME} ` }))).toBe(
      `Welcome to ${FULL_NAME}`,
    );
  });

  it('keeps a template ellipsis at three dots after a name ending in a full stop', () => {
    // The value's own full stop is the first dot, so the template gives up one of its three.
    expect(resolveLinkedText('Welcome to {{name}}...', facts())).toBe(
      'Welcome to Harbor Pointe Condominium Association, Inc...',
    );
  });

  // Controls for the three above. The template's full stop is given up only when the
  // value ends in one AND the template's follows the token directly, and the value
  // itself is never changed.

  it('keeps the template full stop after a name that has none', () => {
    // A short name has no full stop in it, so there is nothing to absorb.
    expect(
      resolveLinkedText(
        'The website of {{name}}. Notices, meetings and records for owners and residents.',
        facts({ shortName: 'Harbor Pointe' }),
      ),
    ).toBe('The website of Harbor Pointe. Notices, meetings and records for owners and residents.');
    expect(resolveLinkedText('Welcome to {{name}}.', facts({ shortName: 'Harbor Pointe' }))).toBe(
      'Welcome to Harbor Pointe.',
    );
  });

  it('keeps all three dots of an ellipsis after a name that has no full stop', () => {
    expect(resolveLinkedText('Welcome to {{name}}...', facts({ shortName: 'Harbor Pointe' }))).toBe(
      'Welcome to Harbor Pointe...',
    );
  });

  it('leaves the name untouched when something other than a full stop follows it', () => {
    // The value keeps its own full stop. Only the template's one is ever given up,
    // so stripping the value's instead would show here ("Inc, friends.").
    expect(resolveLinkedText('Welcome to {{name}}, friends.', facts())).toBe(
      `Welcome to ${FULL_NAME}, friends.`,
    );
  });

  // Odd values: they are data, whatever they look like.

  it('never splits on punctuation inside an inserted value', () => {
    const name = 'Harbor Pointe Condo. Assn.';

    // Dropping is decided on the template. The whole sentence goes; the value's own
    // full stops must not leave "Harbor Pointe Condo." behind.
    expect(resolveLinkedText('{{name}} is in {{city}}.', facts({ name, city: null }))).toBe('');
    // And a kept sentence keeps the value whole.
    expect(resolveLinkedText('{{name}} welcomes you. News.', facts({ name }))).toBe(
      'Harbor Pointe Condo. Assn. welcomes you. News.',
    );
  });

  it('does not drop a sentence because an inserted value looks like a token', () => {
    // The name reads as the token for a fact that is missing. It is still just a
    // name, so the sentence stays.
    expect(
      resolveLinkedText('Welcome to {{name}}. News.', facts({ name: '{{units}}', unitCount: null })),
    ).toBe('Welcome to {{units}}. News.');
  });

  it('inserts a 120-character name unchanged', () => {
    const name = '{{city}}'.repeat(15); // 120 characters, every one of them token-shaped

    expect(name).toHaveLength(120);
    expect(resolveLinkedText('Welcome to {{name}}', facts({ name, city: 'Miami' }))).toBe(
      `Welcome to ${name}`,
    );
  });

  it('inserts replacement patterns such as $& literally', () => {
    const name = "Pointe $& $1 $$ $` $'";

    expect(resolveLinkedText('Welcome to {{name}}', facts({ name }))).toBe(`Welcome to ${name}`);
  });

  it('resolves a repeated token every time it appears', () => {
    expect(
      resolveLinkedText('{{name}}, {{name}}!', facts({ shortName: 'Harbor Pointe' })),
    ).toBe('Harbor Pointe, Harbor Pointe!');
  });

  it('leaves malformed tokens as written and never drops a sentence for them', () => {
    for (const token of ['{{ name }}', '{{Name}}', '{name}', '{{name}', '{{phone}}']) {
      // The second sentence lacks its city and drops; the first only holds `token`.
      expect(resolveLinkedText(`Call ${token} today. {{city}} is home.`, facts())).toBe(
        `Call ${token} today.`,
      );
    }
  });

  it('returns text with no tokens as written', () => {
    expect(resolveLinkedText('News and records, all in one place.', facts())).toBe(
      'News and records, all in one place.',
    );
  });

  // parseLinkedText, which the editor uses to show tokens as chips.

  it('parseLinkedText returns no segments for an empty string', () => {
    expect(parseLinkedText('')).toEqual([]);
  });

  it('parseLinkedText returns one text segment when there is no token', () => {
    expect(parseLinkedText('News and records.')).toEqual([
      { kind: 'text', value: 'News and records.' },
    ]);
  });

  it('parseLinkedText emits back-to-back fields without an empty text segment between', () => {
    expect(parseLinkedText('{{city}}{{units}}')).toEqual([
      { kind: 'field', field: 'city' },
      { kind: 'field', field: 'units' },
    ]);
    expect(parseLinkedText('{{name}}')).toEqual([{ kind: 'field', field: 'name' }]);
  });

  it('parseLinkedText keeps unknown tokens inside text segments', () => {
    expect(parseLinkedText('Call {{phone}} or {{city}}')).toEqual([
      { kind: 'text', value: 'Call {{phone}} or ' },
      { kind: 'field', field: 'city' },
    ]);
  });

  it('parseLinkedText round-trips: the segments joined give back the original text', () => {
    const samples = [
      '',
      'plain',
      '{{name}}',
      'Hi {{name}}!',
      '{{city}}{{units}}',
      '{{{name}}}',
      '{{ name }} {{name}}',
      '}}{{units}}{{',
      '{{phone}} and {{city}}.',
      'line one\n{{name}}\r\nline two',
    ];

    for (const text of samples) {
      const segments = parseLinkedText(text);

      expect(segments.map((s) => (s.kind === 'text' ? s.value : `{{${s.field}}}`)).join('')).toBe(
        text,
      );
      // No empty text segments, so a chip editor never renders an empty run.
      expect(segments.every((s) => s.kind === 'field' || s.value !== '')).toBe(true);
    }
  });

  // The token list and the code that recognises tokens must not drift apart.

  it('lists exactly the three tokens', () => {
    expect([...LINKED_FIELDS]).toEqual(['name', 'city', 'units']);
  });

  it('recognises and resolves every entry of LINKED_FIELDS', () => {
    // `satisfies` makes adding a field to LINKED_FIELDS a type error here until
    // its expected output is written down.
    const expected = { name: 'Harbor Pointe', city: 'Miami', units: '1,200' } satisfies Record<
      LinkedField,
      string
    >;
    const known = facts({ shortName: 'Harbor Pointe', city: 'Miami', unitCount: 1200 });

    for (const field of LINKED_FIELDS) {
      expect(parseLinkedText(`{{${field}}}`)).toEqual([{ kind: 'field', field }]);
      expect(resolveLinkedText(`{{${field}}}`, known)).toBe(expected[field]);
    }
  });

  it('is exported from the package entry', () => {
    expect(shared.LINKED_FIELDS).toBe(LINKED_FIELDS);
    expect(shared.resolveLinkedText).toBe(resolveLinkedText);
    expect(shared.parseLinkedText).toBe(parseLinkedText);
  });
});
