/**
 * Quick links block schema.
 *
 * The block stores no links. Which links it shows, and where each one points,
 * is decided when the page renders, from the sections the page really has. So a
 * stored row can only say "hidden", and the schema is strict so nothing else can
 * be tucked into it: a link list stored here would be a second place for a
 * target to go stale.
 */
import { describe, it, expect } from 'vitest';
import { quicklinksBlockSchema } from '../../src/site-blocks/quicklinks';
import * as shared from '../../src/index';

const accepts = (content: unknown) => quicklinksBlockSchema.safeParse(content).success;

describe('quicklinksBlockSchema', () => {
  it('accepts an empty block, since the renderer decides the links', () => {
    expect(accepts({})).toBe(true);
  });

  it('accepts hidden: true', () => {
    expect(accepts({ hidden: true })).toBe(true);
  });

  it('rejects hidden: false, since absence is the only way to say visible', () => {
    expect(accepts({ hidden: false })).toBe(false);
  });

  it('quicklinks rejects unknown keys', () => {
    // A heading, a link list and a target are all things a later change might be
    // tempted to store here. Each must be refused until the schema grows them.
    expect(accepts({ heading: 'Quick links' })).toBe(false);
    expect(accepts({ links: [] })).toBe(false);
    expect(accepts({ links: [{ label: 'News', target: '#announcements' }] })).toBe(false);
    expect(accepts({ hidden: true, ctaTarget: '/auth/login' })).toBe(false);
  });

  it('is re-exported from the package entry point', () => {
    expect(shared.quicklinksBlockSchema).toBe(quicklinksBlockSchema);
  });
});
