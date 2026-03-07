import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HeroEditor } from '../../src/components/site-builder/editors/HeroEditor';
import { ContactEditor } from '../../src/components/site-builder/editors/ContactEditor';

describe('site builder editor field IDs', () => {
  it('suffixes hero field IDs and labels with blockId', () => {
    const html = renderToStaticMarkup(
      createElement(HeroEditor, {
        blockId: 12,
        content: {
          headline: 'Welcome',
          subheadline: 'Subheadline',
          ctaLabel: 'Get Started',
          ctaHref: '/auth/login',
        },
        onChange: () => {},
      }),
    );

    expect(html).toContain('id="hero-headline-12"');
    expect(html).toContain('for="hero-headline-12"');
    expect(html).toContain('id="hero-cta-href-12"');
    expect(html).toContain('for="hero-cta-href-12"');
    expect(html).not.toMatch(/id="hero-headline"/);
  });

  it('creates unique contact field IDs for different blocks', () => {
    const firstHtml = renderToStaticMarkup(
      createElement(ContactEditor, {
        blockId: 101,
        content: { boardEmail: 'board1@example.com' },
        onChange: () => {},
      }),
    );
    const secondHtml = renderToStaticMarkup(
      createElement(ContactEditor, {
        blockId: 202,
        content: { boardEmail: 'board2@example.com' },
        onChange: () => {},
      }),
    );

    expect(firstHtml).toContain('id="contact-email-101"');
    expect(firstHtml).toContain('for="contact-email-101"');
    expect(secondHtml).toContain('id="contact-email-202"');
    expect(secondHtml).toContain('for="contact-email-202"');
  });
});
