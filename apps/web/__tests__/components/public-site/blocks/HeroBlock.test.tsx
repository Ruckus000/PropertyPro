import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeroBlock } from '@/components/public-site/blocks/HeroBlock';
import type { BlockRendererProps } from '@/components/public-site/blocks/types';

const communityFixture = {
  id: 1,
  slug: 'sunset-condos',
  name: 'Sunset Condos',
  logoUrl: null,
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

const savedEnv = process.env.NEXT_PUBLIC_SUPABASE_URL;
beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
});
afterEach(() => {
  if (savedEnv === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = savedEnv;
});

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

  it('builds the hero image src from the Supabase CDN base when configured', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    render(
      <HeroBlock
        {...makeProps({
          headline: 'X',
          heroImagePath: '1/hero/test.1600w.webp',
          heroImageAlt: 'The pool at golden hour',
        })}
      />,
    );
    expect(screen.getByRole('img', { name: 'The pool at golden hour' })).toHaveAttribute(
      'src',
      'https://example.supabase.co/storage/v1/object/public/community-site-assets/1/hero/test.1600w.webp',
    );
  });

  it('falls back to a relative path when NEXT_PUBLIC_SUPABASE_URL is unset', () => {
    render(
      <HeroBlock
        {...makeProps({
          headline: 'X',
          heroImagePath: '1/hero/test.1600w.webp',
          heroImageAlt: 'The pool at golden hour',
        })}
      />,
    );
    expect(screen.getByRole('img', { name: 'The pool at golden hour' })).toHaveAttribute(
      'src',
      '/site-assets/1/hero/test.1600w.webp',
    );
  });
});

describe('<HeroBlock> — hero photos (Phase 9)', () => {
  const PATH = '1/hero/pool.jpg';

  it('still renders a legacy single image, upgraded on read', () => {
    // The regression that matters most: every community that set a hero image
    // before `photos` existed must keep it, with no backfill.
    render(
      <HeroBlock
        {...makeProps({ headline: 'X', heroImagePath: PATH, heroImageAlt: 'The pool' })}
      />,
    );
    const img = screen.getByAltText('The pool');
    expect(img).toHaveAttribute('src', expect.stringContaining(`${PATH}.1600w.webp`));
  });

  it('strips a stored variant suffix rather than doubling it', () => {
    // The onboarding wizard stored the already-suffixed 1600w path. Without
    // the strip this requests `pool.jpg.1600w.webp.1600w.webp` and 404s.
    render(
      <HeroBlock
        {...makeProps({
          headline: 'X',
          heroImagePath: `${PATH}.1600w.webp`,
          heroImageAlt: 'The pool',
        })}
      />,
    );
    const src = screen.getByAltText('The pool').getAttribute('src')!;
    expect(src).toContain(`${PATH}.1600w.webp`);
    expect(src).not.toContain('.1600w.webp.1600w.webp');
  });

  it('serves a srcset, which the old single-path convention could not', () => {
    render(
      <HeroBlock {...makeProps({ headline: 'X', photos: [{ path: PATH, alt: 'The pool' }] })} />,
    );
    expect(screen.getByAltText('The pool')).toHaveAttribute(
      'srcset',
      expect.stringContaining('800w'),
    );
  });

  it('renders a single photo without the carousel chrome', () => {
    render(
      <HeroBlock {...makeProps({ headline: 'X', photos: [{ path: PATH, alt: 'The pool' }] })} />,
    );
    expect(screen.queryByRole('group', { name: /Community photos/ })).not.toBeInTheDocument();
  });

  it('renders two or more photos as a labelled carousel', () => {
    render(
      <HeroBlock
        {...makeProps({
          headline: 'X',
          photos: [
            { path: PATH, alt: 'The pool' },
            { path: '1/hero/gym.jpg', alt: 'The gym' },
          ],
        })}
      />,
    );
    const carousel = screen.getByRole('group', { name: 'Community photos, 2 total' });
    expect(carousel).toHaveAttribute('aria-roledescription', 'carousel');

    // Each slide is individually identified...
    expect(screen.getByRole('group', { name: 'Photo 1 of 2' })).toHaveAttribute(
      'aria-roledescription',
      'slide',
    );
    // ...and reachable by a labelled dot.
    expect(screen.getByRole('link', { name: 'Go to photo 2 of 2' })).toHaveAttribute(
      'href',
      '#hero-10-photo-1',
    );
  });

  it('gives a decorative photo an empty alt so screen readers skip it', () => {
    const { container } = render(
      <HeroBlock
        {...makeProps({
          headline: 'X',
          photos: [
            { path: PATH, alt: 'The pool' },
            { path: '1/hero/texture.jpg', decorative: true },
          ],
        })}
      />,
    );
    const imgs = Array.from(container.querySelectorAll('img'));
    expect(imgs.map((i) => i.getAttribute('alt'))).toEqual(['The pool', '']);
  });

  it('loads the first photo eagerly and defers the rest', () => {
    const { container } = render(
      <HeroBlock
        {...makeProps({
          headline: 'X',
          photos: [
            { path: PATH, alt: 'One' },
            { path: '1/hero/two.jpg', alt: 'Two' },
            { path: '1/hero/three.jpg', alt: 'Three' },
          ],
        })}
      />,
    );
    const loading = Array.from(container.querySelectorAll('img')).map((i) =>
      i.getAttribute('loading'),
    );
    expect(loading).toEqual(['eager', 'lazy', 'lazy']);
  });

  it('renders no imagery at all for a hero with none', () => {
    const { container } = render(<HeroBlock {...makeProps({ headline: 'X' })} />);
    expect(container.querySelector('img')).toBeNull();
  });
});
