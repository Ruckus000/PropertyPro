import { describe, expect, it } from 'vitest';
import { toFontLinks } from '../src';

describe('toFontLinks', () => {
  it('returns empty array when heading and body fonts are both Inter (self-hosted)', () => {
    const links = toFontLinks({
      primaryColor: '#2563EB',
      secondaryColor: '#6B7280',
      accentColor: '#DBEAFE',
      fontHeading: 'Inter',
      fontBody: 'Inter',
      logoUrl: null,
      communityName: 'Sunset Condos',
      communityType: 'condo_718',
    });

    expect(links).toEqual([]);
  });

  it('returns only non-Inter font link when one font is Inter', () => {
    const links = toFontLinks({
      primaryColor: '#2563EB',
      secondaryColor: '#6B7280',
      accentColor: '#DBEAFE',
      fontHeading: 'Playfair Display',
      fontBody: 'Inter',
      logoUrl: null,
      communityName: 'Test',
      communityType: 'condo_718',
    });

    expect(links).toEqual([
      'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&display=swap',
    ]);
  });

  it('returns two unique URLs when heading and body fonts differ', () => {
    const links = toFontLinks({
      primaryColor: '#2563EB',
      secondaryColor: '#6B7280',
      accentColor: '#DBEAFE',
      fontHeading: 'Open Sans',
      fontBody: 'Playfair Display',
      logoUrl: null,
      communityName: 'Palm Shores HOA',
      communityType: 'hoa_720',
    });

    expect(links).toEqual([
      'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap',
      'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&display=swap',
    ]);
  });
});
