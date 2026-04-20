import { describe, expect, it } from 'vitest';
import { slugifyHeading } from '../../src/lib/help/anchors';

describe('slugifyHeading', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugifyHeading('Getting Started Quickly')).toBe('getting-started-quickly');
  });

  it('strips punctuation and non-ASCII characters', () => {
    expect(slugifyHeading('What about § 718 docs? It works!')).toBe('what-about-718-docs-it-works');
  });

  it('collapses repeated separators', () => {
    expect(slugifyHeading('a   b - c')).toBe('a-b-c');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugifyHeading('  --leading and trailing--  ')).toBe('leading-and-trailing');
  });

  it('truncates slugs longer than 60 characters', () => {
    const long = 'word '.repeat(40);
    const slug = slugifyHeading(long);
    expect(slug.length).toBeLessThanOrEqual(60);
  });

  it('returns an empty string when the input has no slug-friendly characters', () => {
    expect(slugifyHeading('!!!')).toBe('');
    expect(slugifyHeading('')).toBe('');
  });
});
