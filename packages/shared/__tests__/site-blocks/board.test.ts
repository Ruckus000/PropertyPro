/**
 * Board members block schema.
 *
 * The block stores a heading and nothing about any person. The members, their
 * titles and the order they appear in come from the community's board seats when
 * the page renders, so the stored row can never hold a stale name or an email
 * address. The schema is strict to keep it that way.
 */
import { describe, it, expect } from 'vitest';
import { boardBlockSchema, DEFAULT_BOARD_HEADING } from '../../src/site-blocks/board';
import * as shared from '../../src/index';

const accepts = (content: unknown) => boardBlockSchema.safeParse(content).success;

describe('boardBlockSchema', () => {
  it('accepts an empty block, since the renderer has a default heading', () => {
    expect(accepts({})).toBe(true);
  });

  it('board heading is 1–80 characters', () => {
    expect(accepts({ heading: 'a' })).toBe(true);
    expect(accepts({ heading: 'a'.repeat(80) })).toBe(true);
    expect(accepts({ heading: '' })).toBe(false);
    expect(accepts({ heading: 'a'.repeat(81) })).toBe(false);
  });

  it('measures the heading after trimming, so spaces neither fill it nor save it', () => {
    // Spaces alone are an empty heading, not a blank one that would render as a
    // gap above the list.
    expect(accepts({ heading: '   ' })).toBe(false);
    // The limit applies to the text the visitor sees, not to the padding around it.
    expect(accepts({ heading: ` ${'a'.repeat(80)} ` })).toBe(true);
    expect(accepts({ heading: `${'a'.repeat(80)}b` })).toBe(false);

    const parsed = boardBlockSchema.safeParse({ heading: '  Your board  ' });
    expect(parsed.success && parsed.data.heading).toBe('Your board');
  });

  it('accepts hidden: true and rejects hidden: false', () => {
    expect(accepts({ hidden: true })).toBe(true);
    expect(accepts({ heading: 'Your board', hidden: true })).toBe(true);
    expect(accepts({ hidden: false })).toBe(false);
  });

  it('rejects unknown keys, so no member data can be stored in the block', () => {
    expect(accepts({ members: [] })).toBe(false);
    expect(accepts({ members: [{ name: 'Ana Ruiz', title: 'Board President' }] })).toBe(false);
    expect(accepts({ heading: 'Your board', showEmail: true })).toBe(false);
    expect(accepts({ email: 'ana@example.com' })).toBe(false);
  });

  it('is re-exported from the package entry point', () => {
    expect(shared.boardBlockSchema).toBe(boardBlockSchema);
    expect(shared.DEFAULT_BOARD_HEADING).toBe('Board of Directors');
  });
});

describe('DEFAULT_BOARD_HEADING', () => {
  // The heading the section shows when the manager has not named it. It lives
  // beside the schema because the public view and the editor's form both read it.

  it('is "Board of Directors"', () => {
    expect(DEFAULT_BOARD_HEADING).toBe('Board of Directors');
  });

  it('is a heading the schema would accept, so a manager can type it back', () => {
    // An undefined heading is also accepted (it is optional), so check it is text.
    expect(typeof DEFAULT_BOARD_HEADING).toBe('string');
    expect(accepts({ heading: DEFAULT_BOARD_HEADING })).toBe(true);
  });
});
