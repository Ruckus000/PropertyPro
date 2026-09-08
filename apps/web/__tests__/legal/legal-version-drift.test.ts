/**
 * The version-drift guard that `packages/shared/src/constants/legal.ts` has always
 * claimed to have.
 *
 * That file's docblock names this exact path and calls it "the whole safety
 * mechanism here". It did not exist. The consequence was already on disk when
 * this was written: terms.md's header said 2026-08-10.1 while its own footer
 * still said 2026-08-09.1, bumped in one place and not the other.
 *
 * It is not a hypothetical failure mode either. Writing this change, the first
 * attempt at the bump used a regex that could not match a hyphen, and produced
 * `**Version:** 2026-09-07.1-08-09.1` in two files while leaving both footers
 * and the constant untouched. Every existing test still passed.
 *
 * Each document carries the version TWICE — the header and an italic footer —
 * and the constant is a fourth place. Four strings, three files, one identifier.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CURRENT_TERMS_VERSION } from '@propertypro/shared';

const LEGAL_DIR = join(__dirname, '../../src/content/legal');
const DOCS = ['terms', 'privacy', 'accessibility'] as const;

/** `2026-09-07.1` — the shape every version string in this repo uses. */
const VERSION = /\d{4}-\d{2}-\d{2}\.\d+/;

function read(doc: string): string {
  return readFileSync(join(LEGAL_DIR, `${doc}.md`), 'utf8');
}

describe('legal version drift', () => {
  it('uses a well-formed version identifier', () => {
    // Anti-vacuity: if the constant were malformed or empty, every comparison
    // below would still pass by matching it against itself.
    expect(CURRENT_TERMS_VERSION).toMatch(new RegExp(`^${VERSION.source}$`));
  });

  for (const doc of DOCS) {
    describe(`${doc}.md`, () => {
      const content = read(doc);

      it('declares the current version in its header', () => {
        const header = new RegExp(`\\*\\*Version:\\*\\* (${VERSION.source})`).exec(content);
        expect(header, 'no **Version:** header found').not.toBeNull();
        expect(header?.[1]).toBe(CURRENT_TERMS_VERSION);
      });

      it('repeats the same version in its footer', () => {
        // The half that drifted last time, and the half a careless bump misses.
        const footer = new RegExp(`\\*Version (${VERSION.source}) — last updated`).exec(content);
        expect(footer, 'no italic version footer found').not.toBeNull();
        expect(footer?.[1]).toBe(CURRENT_TERMS_VERSION);
      });

      it('does not name the current version as superseded', () => {
        // A bump that forgets to advance the Supersedes clause claims the
        // document replaced itself.
        const superseded = new RegExp(`\\*Supersedes version (${VERSION.source})\\*`).exec(content);
        if (superseded) expect(superseded[1]).not.toBe(CURRENT_TERMS_VERSION);
      });
    });
  }
});
