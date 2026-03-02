import { describe, it, expect } from 'vitest';
import { toFontLinks } from '../src/to-font-links';
import type { CommunityTheme } from '../src/types';

const baseTheme: CommunityTheme = {
  primaryColor: '#2563EB',
  secondaryColor: '#6B7280',
  accentColor: '#DBEAFE',
  fontHeading: 'Inter',
  fontBody: 'Inter',
  logoUrl: null,
  communityName: 'Test',
  communityType: 'condo_718',
};

describe('toFontLinks', () => {
  it('returns 1 link when heading and body font are the same', () => {
    const links = toFontLinks({ ...baseTheme, fontHeading: 'Inter', fontBody: 'Inter' });

    expect(links).toHaveLength(1);
    expect(links[0]).toContain('Inter');
    expect(links[0]).toContain('wght@400;500;600;700');
  });

  it('returns 2 links when heading and body fonts differ', () => {
    const links = toFontLinks({ ...baseTheme, fontHeading: 'Poppins', fontBody: 'Lato' });

    expect(links).toHaveLength(2);
    const linkStr = links.join(' ');
    expect(linkStr).toContain('Poppins');
    expect(linkStr).toContain('Lato');
  });

  it('encodes spaces in font names', () => {
    const links = toFontLinks({ ...baseTheme, fontHeading: 'Open Sans', fontBody: 'Open Sans' });

    expect(links[0]).toContain('Open+Sans');
  });

  it('links point to Google Fonts API', () => {
    const links = toFontLinks(baseTheme);

    for (const link of links) {
      expect(link.startsWith('https://fonts.googleapis.com/css2?family=')).toBe(true);
      expect(link).toContain('display=swap');
    }
  });
});
