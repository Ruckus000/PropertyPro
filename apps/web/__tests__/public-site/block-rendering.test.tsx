import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CommunityTheme } from '@propertypro/theme';

// Mock @propertypro/db to avoid DATABASE_URL requirement in unit tests.
// Server component blocks (Announcements, Documents, Meetings) require DB access
// and are tested separately via integration tests.
vi.mock('@propertypro/db', () => ({
  createScopedClient: vi.fn(),
  announcements: {},
  documents: {},
  meetings: {},
  siteBlocks: {},
}));

vi.mock('@propertypro/db/filters', () => ({
  asc: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
}));

import { HeroBlock } from '../../src/components/public-site/blocks/HeroBlock';
import { ContactBlock } from '../../src/components/public-site/blocks/ContactBlock';
import { TextBlock } from '../../src/components/public-site/blocks/TextBlock';
import { ImageBlock } from '../../src/components/public-site/blocks/ImageBlock';
import { PublicSiteHeader } from '../../src/components/public-site/PublicSiteHeader';
import { PublicSiteFooter } from '../../src/components/public-site/PublicSiteFooter';
import { BLOCK_RENDERERS } from '../../src/components/public-site/blocks';

const testTheme: CommunityTheme = {
  primaryColor: '#2563EB',
  secondaryColor: '#6B7280',
  accentColor: '#DBEAFE',
  fontHeading: 'Inter',
  fontBody: 'Inter',
  logoUrl: null,
  communityName: 'Sunset Condos',
  communityType: 'condo_718',
};

const defaultBlockProps = {
  communityId: 1,
  theme: testTheme,
};

describe('BLOCK_RENDERERS registry', () => {
  it('has entries for all 7 block types', () => {
    expect(Object.keys(BLOCK_RENDERERS).sort()).toEqual([
      'announcements',
      'contact',
      'documents',
      'hero',
      'image',
      'meetings',
      'text',
    ]);
  });

  it('all entries are functions', () => {
    for (const [, renderer] of Object.entries(BLOCK_RENDERERS)) {
      expect(typeof renderer).toBe('function');
    }
  });
});

describe('HeroBlock', () => {
  it('renders headline and subheadline', () => {
    const html = renderToStaticMarkup(
      <HeroBlock
        {...defaultBlockProps}
        content={{
          headline: 'Welcome Home',
          subheadline: 'Your community, your way',
        }}
      />,
    );

    expect(html).toContain('Welcome Home');
    expect(html).toContain('Your community, your way');
  });

  it('renders CTA button when ctaLabel and ctaHref provided', () => {
    const html = renderToStaticMarkup(
      <HeroBlock
        {...defaultBlockProps}
        content={{
          headline: 'Welcome',
          ctaLabel: 'Learn More',
          ctaHref: '/about',
        }}
      />,
    );

    expect(html).toContain('Learn More');
    expect(html).toContain('/about');
  });

  it('renders background image overlay when backgroundImageUrl provided', () => {
    const html = renderToStaticMarkup(
      <HeroBlock
        {...defaultBlockProps}
        content={{
          headline: 'Welcome',
          backgroundImageUrl: 'https://example.com/hero.jpg',
        }}
      />,
    );

    expect(html).toContain('https://example.com/hero.jpg');
    // Dark overlay div
    expect(html).toContain('bg-black/50');
  });

  it('falls back to community name when headline is missing', () => {
    const html = renderToStaticMarkup(
      <HeroBlock
        {...defaultBlockProps}
        content={{}}
      />,
    );

    expect(html).toContain('Sunset Condos');
  });

  it('applies theme primaryColor as background', () => {
    const html = renderToStaticMarkup(
      <HeroBlock
        {...defaultBlockProps}
        content={{ headline: 'Hello' }}
      />,
    );

    expect(html).toContain('#2563EB');
  });
});

describe('ContactBlock', () => {
  it('renders all contact fields', () => {
    const html = renderToStaticMarkup(
      <ContactBlock
        {...defaultBlockProps}
        content={{
          boardEmail: 'info@sunset.com',
          phone: '555-123-4567',
          address: '123 Beach Ave\nMiami, FL 33101',
          managementCompany: 'ABC Property Mgmt',
        }}
      />,
    );

    expect(html).toContain('Contact Us');
    expect(html).toContain('info@sunset.com');
    expect(html).toContain('mailto:info@sunset.com');
    expect(html).toContain('555-123-4567');
    expect(html).toContain('tel:555-123-4567');
    expect(html).toContain('123 Beach Ave');
    expect(html).toContain('ABC Property Mgmt');
  });

  it('renders default heading "Contact Us"', () => {
    const html = renderToStaticMarkup(
      <ContactBlock
        {...defaultBlockProps}
        content={{ boardEmail: 'test@test.com' }}
      />,
    );

    expect(html).toContain('Contact Us');
  });

  it('shows fallback when no contact fields provided', () => {
    const html = renderToStaticMarkup(
      <ContactBlock
        {...defaultBlockProps}
        content={{}}
      />,
    );

    expect(html).toContain('Contact information coming soon');
  });
});

describe('TextBlock', () => {
  it('renders plain text content', () => {
    const html = renderToStaticMarkup(
      <TextBlock
        {...defaultBlockProps}
        content={{ body: 'Hello, residents!' }}
      />,
    );

    expect(html).toContain('Hello, residents!');
    expect(html).toContain('whitespace-pre-wrap');
  });

  it('returns null when body is empty', () => {
    const html = renderToStaticMarkup(
      <TextBlock
        {...defaultBlockProps}
        content={{ body: '' }}
      />,
    );

    expect(html).toBe('');
  });
});

describe('ImageBlock', () => {
  it('renders image with alt text', () => {
    const html = renderToStaticMarkup(
      <ImageBlock
        {...defaultBlockProps}
        content={{
          url: 'https://example.com/photo.jpg',
          alt: 'Community pool',
        }}
      />,
    );

    expect(html).toContain('https://example.com/photo.jpg');
    expect(html).toContain('Community pool');
    expect(html).toContain('<figure');
    expect(html).toContain('<img');
  });

  it('renders caption when provided', () => {
    const html = renderToStaticMarkup(
      <ImageBlock
        {...defaultBlockProps}
        content={{
          url: 'https://example.com/photo.jpg',
          alt: 'Pool',
          caption: 'Our newly renovated pool area',
        }}
      />,
    );

    expect(html).toContain('<figcaption');
    expect(html).toContain('Our newly renovated pool area');
  });

  it('returns null when url is missing', () => {
    const html = renderToStaticMarkup(
      <ImageBlock
        {...defaultBlockProps}
        content={{ url: '', alt: 'Test' }}
      />,
    );

    expect(html).toBe('');
  });
});

describe('PublicSiteHeader', () => {
  it('renders community name and login link', () => {
    const html = renderToStaticMarkup(
      <PublicSiteHeader theme={testTheme} />,
    );

    expect(html).toContain('Sunset Condos');
    expect(html).toContain('Resident Login');
    expect(html).toContain('/auth/login');
  });

  it('renders logo when logoUrl is provided', () => {
    const themeWithLogo: CommunityTheme = {
      ...testTheme,
      logoUrl: 'https://example.com/logo.png',
    };

    const html = renderToStaticMarkup(
      <PublicSiteHeader theme={themeWithLogo} />,
    );

    expect(html).toContain('https://example.com/logo.png');
    expect(html).toContain('logo');
  });

  it('does not render logo img when logoUrl is null', () => {
    const html = renderToStaticMarkup(
      <PublicSiteHeader theme={testTheme} />,
    );

    expect(html).not.toContain('<img');
  });

  it('applies theme primaryColor as background', () => {
    const html = renderToStaticMarkup(
      <PublicSiteHeader theme={testTheme} />,
    );

    expect(html).toContain('#2563EB');
  });
});

describe('PublicSiteFooter', () => {
  it('renders community name and copyright year', () => {
    const html = renderToStaticMarkup(
      <PublicSiteFooter communityName="Sunset Condos" />,
    );

    const currentYear = new Date().getFullYear();
    expect(html).toContain('Sunset Condos');
    expect(html).toContain(String(currentYear));
  });

  it('renders Powered by PropertyPro link', () => {
    const html = renderToStaticMarkup(
      <PublicSiteFooter communityName="Test Community" />,
    );

    expect(html).toContain('Powered by');
    expect(html).toContain('PropertyPro');
    expect(html).toContain('propertyprofl.com');
  });
});
