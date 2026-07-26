import { describe, it, expect } from 'vitest';
import { TOMBSTONE_BLOCK_TYPE } from '../site-blocks/index';
import { blockIssues, heroIssues, publishBlocked, siteIssues } from './validate';
import type { Issue, SiteSnapshot } from './types';

const errors = (issues: readonly Issue[]) => issues.filter((i) => i.severity === 'error');
const warnings = (issues: readonly Issue[]) => issues.filter((i) => i.severity === 'warning');

describe('blockIssues — errors come from zod', () => {
  it('surfaces a schema failure with a dotted field path', () => {
    const issues = blockIssues('text', { body: '' }, 'sections.0.content');
    expect(errors(issues)).not.toHaveLength(0);
    expect(issues[0]!.field).toMatch(/^sections\.0\.content/);
  });

  it('errors on a non-decorative image with no alt text — a zod rule, not ours', () => {
    const issues = blockIssues('image', { imagePath: '42/content/a.webp' });
    expect(errors(issues)).not.toHaveLength(0);
  });

  it('accepts a decorative image with no alt text', () => {
    const issues = blockIssues('image', { imagePath: '42/content/a.webp', decorative: true });
    expect(errors(issues)).toHaveLength(0);
  });

  it('errors on a block type this site cannot render', () => {
    const issues = blockIssues('payments', {});
    expect(errors(issues)).toHaveLength(1);
    expect(issues[0]!.message).toMatch(/not a section type/);
  });

  it('says nothing about a tombstone', () => {
    expect(blockIssues(TOMBSTONE_BLOCK_TYPE, {})).toEqual([]);
  });
});

describe('blockIssues — advisories never block', () => {
  it('warns about a whitespace-only string that clears zod min(1)', () => {
    // `" "` has length 1 so `.min(1)` passes; the page renders an empty block.
    const issues = blockIssues('text', { body: '   ' });
    expect(errors(issues)).toHaveLength(0);
    expect(warnings(issues).some((i) => i.message.includes('only spaces'))).toBe(true);
  });

  it('warns about a very short text body', () => {
    const issues = blockIssues('text', { body: 'Hi' });
    expect(errors(issues)).toHaveLength(0);
    expect(warnings(issues)).not.toHaveLength(0);
  });

  it('says nothing about a text body of reasonable length', () => {
    const issues = blockIssues('text', { body: 'A genuinely useful paragraph of community information.' });
    expect(issues).toEqual([]);
  });

  it('warns about a one-photo gallery', () => {
    const issues = blockIssues('gallery', {
      images: [{ imagePath: '42/content/a.webp', altText: 'A' }],
    });
    expect(errors(issues)).toHaveLength(0);
    expect(warnings(issues)).not.toHaveLength(0);
  });

  it('warns about a blank FAQ answer, naming the item index', () => {
    const issues = blockIssues('faq', {
      items: [
        { question: 'When is trash day?', answer: 'Tuesday.' },
        { question: 'Who do I call?', answer: '   ' },
      ],
    });
    expect(errors(issues)).toHaveLength(0);
    expect(warnings(issues).some((i) => i.field.includes('items.1.answer'))).toBe(true);
  });
});

describe('heroIssues', () => {
  it('warns when the headline is still the seeded default', () => {
    const issues = heroIssues({ headline: 'Welcome' });
    expect(errors(issues)).toHaveLength(0);
    expect(warnings(issues).some((i) => i.message.includes('still the default'))).toBe(true);
  });

  it('says nothing about a real headline', () => {
    expect(heroIssues({ headline: 'Sunset Condos' })).toEqual([]);
  });

  it('warns when the image description is just the filename', () => {
    const issues = heroIssues({
      headline: 'Sunset Condos',
      heroImagePath: '42/hero/beach-front.webp',
      heroImageAlt: 'beach-front.webp',
    });
    expect(warnings(issues).some((i) => i.field.endsWith('heroImageAlt'))).toBe(true);
  });

  it('does not add advisories on top of a schema error', () => {
    // A hero with no headline fails zod; piling taste notes on a hard error
    // just buries the actionable message.
    const issues = heroIssues({});
    expect(errors(issues)).not.toHaveLength(0);
    expect(warnings(issues)).toHaveLength(0);
  });
});

describe('siteIssues — the cross-section rules', () => {
  const base = (over: Partial<SiteSnapshot> = {}): SiteSnapshot => ({
    hero: { slot: 1, blockType: 'hero', content: { headline: 'Sunset Condos' } },
    sections: [],
    ...over,
  });

  it('is silent for a well-formed site', () => {
    expect(
      siteIssues(
        base({
          sections: [
            { slot: 2, blockType: 'text', content: { body: 'A genuinely useful paragraph here.' } },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it('treats a missing hero as a WARNING, not an error', () => {
    // The public site renders an empty-state hero fallback, so a heroless site
    // is plain rather than broken. Erroring would refuse a publish for a state
    // the renderer explicitly supports.
    const issues = siteIssues(base({ hero: null }));
    expect(errors(issues)).toHaveLength(0);
    expect(warnings(issues)).toHaveLength(1);
    expect(publishBlocked(issues)).toBe(false);
  });

  it('errors on a duplicate slot', () => {
    const issues = siteIssues(
      base({
        sections: [
          { slot: 2, blockType: 'text', content: { body: 'A useful paragraph of text.' } },
          { slot: 2, blockType: 'text', content: { body: 'Another useful paragraph.' } },
        ],
      }),
    );
    expect(errors(issues).some((i) => i.message.includes('Duplicate blockOrder'))).toBe(true);
  });

  it('errors on a non-hero section at slot 1', () => {
    const issues = siteIssues(
      base({ sections: [{ slot: 1, blockType: 'text', content: { body: 'A useful paragraph.' } }] }),
    );
    expect(errors(issues).some((i) => i.message.includes('blockOrder 2 or higher'))).toBe(true);
  });

  it('errors on a hero section away from slot 1', () => {
    const issues = siteIssues(
      base({ sections: [{ slot: 3, blockType: 'hero', content: { headline: 'X' } }] }),
    );
    expect(errors(issues).some((i) => i.message.includes('must be at blockOrder 1'))).toBe(true);
  });

  it('errors on a slot outside 1..99', () => {
    for (const slot of [0, -2, 100, 2.5]) {
      const issues = siteIssues(
        base({ sections: [{ slot, blockType: 'text', content: { body: 'A useful paragraph.' } }] }),
      );
      expect(errors(issues).length, `slot=${slot}`).toBeGreaterThan(0);
    }
  });

  it('does NOT validate the content of a section staged for deletion', () => {
    // Blocking a publish on a section that is being removed would make the
    // removal impossible to ship.
    const issues = siteIssues(
      base({
        sections: [{ slot: 2, blockType: 'text', content: { body: '' } }],
        tombstonedSlots: [2],
      }),
    );
    expect(publishBlocked(issues)).toBe(false);
  });

  it('reports section content errors with a path that identifies the section', () => {
    const issues = siteIssues(
      base({
        sections: [
          { slot: 2, blockType: 'text', content: { body: 'A perfectly fine paragraph.' } },
          { slot: 3, blockType: 'text', content: { body: '' } },
        ],
      }),
    );
    expect(errors(issues)[0]!.field).toMatch(/^sections\.1\.content/);
  });
});

describe('publishBlocked', () => {
  it('is true only when an error is present', () => {
    expect(publishBlocked([])).toBe(false);
    expect(publishBlocked([{ field: 'a', message: 'm', severity: 'warning' }])).toBe(false);
    expect(publishBlocked([
      { field: 'a', message: 'm', severity: 'warning' },
      { field: 'b', message: 'm', severity: 'error' },
    ])).toBe(true);
  });
});
