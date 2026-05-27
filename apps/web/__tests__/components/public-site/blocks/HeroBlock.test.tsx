import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeroBlock } from '@/components/public-site/blocks/HeroBlock';
import type { BlockRendererProps } from '@/components/public-site/blocks/types';

const communityFixture = {
  id: 1,
  slug: 'sunset-condos',
  name: 'Sunset Condos',
  communityType: 'condo_718' as const,
  city: 'Miami',
  state: 'FL',
  timezone: 'America/New_York',
};

const themeFixture = {
  primaryColor: '#0e3338',
  secondaryColor: '#f6f1e6',
  accentColor: '#c66f49',
  headingFont: 'Fraunces',
  bodyFont: 'Manrope',
};

function makeProps(content: unknown): BlockRendererProps {
  return {
    block: { id: 10, blockType: 'hero', blockOrder: 1, content },
    community: communityFixture,
    theme: themeFixture,
    layout: 'tidewater',
  };
}

describe('<HeroBlock>', () => {
  it('renders headline as an h1', () => {
    render(<HeroBlock {...makeProps({ headline: 'Welcome to Sunset Condos' })} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome to Sunset Condos');
  });

  it('renders subtitle when provided', () => {
    render(<HeroBlock {...makeProps({ headline: 'X', subtitle: 'A welcoming community.' })} />);
    expect(screen.getByText('A welcoming community.')).toBeInTheDocument();
  });

  it('omits subtitle when not provided', () => {
    render(<HeroBlock {...makeProps({ headline: 'X' })} />);
    expect(screen.queryByText(/welcoming community/i)).not.toBeInTheDocument();
  });

  it('renders CTA when ctaText + ctaTarget both present', () => {
    render(<HeroBlock {...makeProps({ headline: 'X', ctaText: 'Resident Login', ctaTarget: '/auth/login' })} />);
    const cta = screen.getByRole('link', { name: 'Resident Login' });
    expect(cta).toHaveAttribute('href', '/auth/login');
  });

  it('omits CTA when ctaText or ctaTarget missing', () => {
    render(<HeroBlock {...makeProps({ headline: 'X' })} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders nothing visible (and emits a console warning) when content is invalid', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(<HeroBlock {...makeProps({ headline: '' /* invalid */ })} />);
    expect(container.querySelector('h1')).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('hero block content'),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });

  it('renders hero image with required alt text when provided', () => {
    render(
      <HeroBlock
        {...makeProps({
          headline: 'X',
          heroImagePath: '1/hero/test.webp',
          heroImageAlt: 'The pool at golden hour',
        })}
      />,
    );
    const img = screen.getByRole('img', { name: 'The pool at golden hour' });
    expect(img).toBeInTheDocument();
  });
});
