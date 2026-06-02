import { describe, it, expect } from 'vitest';
import { faqBlockSchema, type FaqBlockContent } from '../../src/site-blocks/faq';

describe('faqBlockSchema', () => {
  const valid: FaqBlockContent = {
    heading: 'Frequently Asked Questions',
    items: [
      { question: 'When are board meetings?', answer: 'Quarterly, posted 14 days in advance.' },
      { question: 'How do I pay dues?', answer: 'Log in to the resident portal and open Payments.' },
    ],
  };

  it('accepts a minimally valid faq (one item, no heading)', () => {
    const minimal = { items: [{ question: 'Q?', answer: 'A.' }] };
    expect(faqBlockSchema.safeParse(minimal).success).toBe(true);
  });

  it('accepts a fully-populated faq', () => {
    expect(faqBlockSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects when items is missing', () => {
    const { items: _items, ...withoutItems } = valid;
    expect(faqBlockSchema.safeParse(withoutItems).success).toBe(false);
  });

  it('rejects an empty items array', () => {
    expect(faqBlockSchema.safeParse({ ...valid, items: [] }).success).toBe(false);
  });

  it('rejects more than 30 items', () => {
    const items = Array.from({ length: 31 }, (_, i) => ({
      question: `Q${i}?`,
      answer: `A${i}.`,
    }));
    expect(faqBlockSchema.safeParse({ items }).success).toBe(false);
  });

  it('accepts exactly 30 items', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      question: `Q${i}?`,
      answer: `A${i}.`,
    }));
    expect(faqBlockSchema.safeParse({ items }).success).toBe(true);
  });

  it('rejects an item with an empty question', () => {
    expect(
      faqBlockSchema.safeParse({ items: [{ question: '', answer: 'A.' }] }).success,
    ).toBe(false);
  });

  it('rejects an item with an empty answer', () => {
    expect(
      faqBlockSchema.safeParse({ items: [{ question: 'Q?', answer: '' }] }).success,
    ).toBe(false);
  });

  it('rejects a question longer than 200 chars', () => {
    expect(
      faqBlockSchema.safeParse({ items: [{ question: 'a'.repeat(201), answer: 'A.' }] }).success,
    ).toBe(false);
  });

  it('rejects an answer longer than 2000 chars', () => {
    expect(
      faqBlockSchema.safeParse({ items: [{ question: 'Q?', answer: 'a'.repeat(2001) }] }).success,
    ).toBe(false);
  });

  it('rejects a heading longer than 120 chars', () => {
    expect(faqBlockSchema.safeParse({ ...valid, heading: 'a'.repeat(121) }).success).toBe(false);
  });

  it('rejects unknown top-level keys (strict)', () => {
    expect(faqBlockSchema.safeParse({ ...valid, extra: true }).success).toBe(false);
  });

  it('rejects unknown keys inside an item (strict)', () => {
    expect(
      faqBlockSchema.safeParse({ items: [{ question: 'Q?', answer: 'A.', extra: 1 }] }).success,
    ).toBe(false);
  });
});
