import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeroBlock } from '@/components/public-site/blocks/HeroBlock';
import type { BlockRendererProps, PublicCommunity } from '@/components/public-site/blocks/types';

const communityFixture: PublicCommunity = {
  id: 1,
  slug: 'sunset-condos',
  name: 'Sunset Condos',
  shortName: null,
  logoUrl: null,
  communityType: 'condo_718',
  city: 'Miami',
  state: 'FL',
  unitCount: null,
  timezone: 'America/New_York',
};

const themeFixture = {
  primaryColor: '#0e3338',
  secondaryColor: '#f6f1e6',
  accentColor: '#c66f49',
  headingFont: 'Fraunces',
  bodyFont: 'Manrope',
};

function makeProps(content: unknown, community: Partial<PublicCommunity> = {}): BlockRendererProps {
  return {
    block: { id: 10, blockType: 'hero', blockOrder: 1, content },
    community: { ...communityFixture, ...community },
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

describe('<HeroBlock> — linked fields (D4)', () => {
  // Copy such as "Welcome to {{name}}" is stored with the token and resolved
  // here, at render, from the facts the community already gave us. A rename in
  // Settings therefore reaches the page with no republish.

  it('hero shows the community name in place of {{name}}', () => {
    render(<HeroBlock {...makeProps({ headline: 'Welcome to {{name}}' })} />);

    // Exact text: `toHaveTextContent('…')` with a string is a substring match.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Welcome to Sunset Condos');
    expect(screen.queryByText(/\{\{/)).not.toBeInTheDocument();
  });

  it('prefers the short name for {{name}} when the community has one', () => {
    render(
      <HeroBlock
        {...makeProps(
          { headline: 'Welcome to {{name}}' },
          { name: 'Sunset Condominium Association, Inc.', shortName: 'Sunset' },
        )}
      />,
    );

    // Exact text, not a substring: "Welcome to Sunset Condominium Association, Inc."
    // contains "Welcome to Sunset", so a substring match cannot tell the short
    // name from the full one.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Welcome to Sunset');
  });

  it('fills {{city}} and {{units}} in the subtitle from the community facts', () => {
    render(
      <HeroBlock
        {...makeProps(
          { headline: 'X', subtitle: '{{units}} homes in {{city}}.' },
          { city: 'Miami', unitCount: 1200 },
        )}
      />,
    );

    expect(screen.getByText('1,200 homes in Miami.')).toBeInTheDocument();
  });

  // Review Focus 1: an odd community name is shown as typed. It is a fact the
  // copy is built from, not more copy, so it is never resolved a second time and
  // never read as markup.
  it('hero renders a name with {{city}} in it literally', () => {
    render(
      <HeroBlock
        {...makeProps(
          { headline: 'Welcome to {{name}}', subtitle: 'Home of {{name}}.' },
          { name: 'Harbor {{city}} Condos', city: 'Miami' },
        )}
      />,
    );

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Welcome to Harbor {{city}} Condos',
    );
    expect(screen.getByText('Home of Harbor {{city}} Condos.')).toBeInTheDocument();
    expect(screen.queryByText(/Harbor Miami/)).not.toBeInTheDocument();
  });

  it('hero renders a name with HTML in it as text and creates no element', () => {
    const name = 'Pointe <b>Bold</b> {{city}}';
    const { container } = render(
      <HeroBlock
        {...makeProps(
          { headline: 'Welcome to {{name}}', subtitle: 'Home of {{name}}.' },
          { name, city: 'Miami' },
        )}
      />,
    );

    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toBe(`Welcome to ${name}`);
    expect(container.querySelector('p')?.textContent).toBe(`Home of ${name}.`);
    // The markup is escaped, so there is a text node and no <b>.
    expect(container.querySelector('b')).toBeNull();
    expect(h1.innerHTML).toContain('&lt;b&gt;Bold&lt;/b&gt;');
  });

  it('hero shows a 120-character name whole', () => {
    const name =
      'The Harbor Pointe at Bayshore Condominium Association of Greater Miami-Dade County, a Florida Not-for-Profit Corp., Inc.';
    expect(name).toHaveLength(120);

    render(<HeroBlock {...makeProps({ headline: '{{name}}' }, { name })} />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(name);
  });

  // Review Focus 2: a missing fact costs its own sentence and nothing else.
  it('hero drops only the sentence whose fact is missing', () => {
    render(
      <HeroBlock
        {...makeProps(
          { headline: 'X', subtitle: 'Homes in {{city}}. {{units}} units. Welcome home.' },
          { city: null, unitCount: 40 },
        )}
      />,
    );

    expect(screen.getByText('40 units. Welcome home.')).toBeInTheDocument();
    expect(screen.queryByText(/Homes in/)).not.toBeInTheDocument();
  });

  it('hero renders no subtitle paragraph when every sentence drops', () => {
    const { container } = render(
      <HeroBlock
        {...makeProps(
          { headline: 'Welcome to {{name}}', subtitle: 'Homes in {{city}}. {{units}} units.' },
          { city: null, unitCount: null },
        )}
      />,
    );

    // The headline is untouched, and nothing stands where the subtitle was: no
    // empty <p> for a screen reader to announce, and no leftover margin box.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Welcome to Sunset Condos');
    expect(container.querySelector('p')).toBeNull();
  });

  // A hero on the page owes the page its <h1>. The layouts skip their own
  // empty-state hero whenever a hero block validates, so a hero whose headline
  // resolved to nothing and drew no heading would leave the page with none. The
  // community's display name stands in: what {{name}} resolves to, the short name
  // when it has one, else the full name.
  it('hero keeps its heading, showing the short name, when the whole headline drops', () => {
    const { container } = render(
      <HeroBlock
        {...makeProps(
          {
            headline: '{{city}}',
            subtitle: 'Welcome home.',
            ctaText: 'Resident Login',
            ctaTarget: '/auth/login',
          },
          { name: 'Sunset Condominium Association, Inc.', shortName: 'Sunset', city: null },
        )}
      />,
    );

    const headings = container.querySelectorAll('h1');
    expect(headings).toHaveLength(1);
    expect(headings[0]!.textContent).toBe('Sunset');
    // The rest of the hero is untouched.
    expect(screen.getByText('Welcome home.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Resident Login' })).toHaveAttribute('href', '/auth/login');
  });

  it('hero keeps its heading, showing the full name, when the headline drops and there is no short name', () => {
    // A blank short name counts as none, exactly as it does for {{name}}.
    for (const shortName of [null, '   ']) {
      const { container, unmount } = render(
        <HeroBlock
          {...makeProps(
            { headline: '{{city}}' },
            { name: 'Sunset Condominium Association, Inc.', shortName, city: null },
          )}
        />,
      );

      const headings = container.querySelectorAll('h1');
      expect(headings).toHaveLength(1);
      expect(headings[0]!.textContent).toBe('Sunset Condominium Association, Inc.');
      unmount();
    }
  });

  it('hero shows its own headline, not the name, when the headline resolves', () => {
    render(
      <HeroBlock
        {...makeProps({ headline: '{{city}}' }, { shortName: 'Sunset', city: 'Miami' })}
      />,
    );

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Miami');
  });

  it('hero shows the name that stands in for a dropped headline as typed, not as markup', () => {
    // The stand-in is the name value inserted as text, never read again: its own
    // {{city}} is not resolved (city is missing, which would drop it), and its <b>
    // is not an element.
    const name = 'Pointe <b>Bold</b> {{city}}';
    const { container } = render(
      <HeroBlock {...makeProps({ headline: '{{city}}' }, { name, shortName: null, city: null })} />,
    );

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(name);
    expect(container.querySelector('b')).toBeNull();
  });

  it('hero keeps its heading but still draws no subtitle when both drop', () => {
    const { container } = render(
      <HeroBlock
        {...makeProps(
          { headline: '{{city}}', subtitle: '{{units}} homes.' },
          { shortName: 'Sunset', city: null, unitCount: null },
        )}
      />,
    );

    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Sunset');
    expect(container.querySelector('p')).toBeNull();
  });

  it('hero drops the {{units}} sentence for a unit count of zero rather than printing "0"', () => {
    render(
      <HeroBlock
        {...makeProps(
          { headline: 'X', subtitle: 'A community of {{units}} homes. Welcome.' },
          { unitCount: 0 },
        )}
      />,
    );

    expect(screen.getByText('Welcome.')).toBeInTheDocument();
    expect(screen.queryByText(/community of/)).not.toBeInTheDocument();
  });
});

describe('<HeroBlock> — stock photos (D3)', () => {
  // A stock photo is one of ours: a file in the web app's public/site-looks/,
  // never a storage path. It has one size, so no srcset.
  const SUNSET = { stock: 'sunset' as const, alt: 'Sunset over the water, with palm trees in silhouette' };
  const PALMS = { stock: 'palms' as const, alt: 'A quiet street lined with tall palm trees' };

  // A stock photo has no path, so a strip keyed by path hands React `undefined`
  // keys. React reports that once per component per run, so whichever of these
  // cases renders a strip first would be the only one to see it: every case
  // watches console.error rather than one dedicated case.
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    const calls = [...consoleError.mock.calls];
    consoleError.mockRestore();
    expect(calls).toEqual([]);
  });

  it('hero renders /site-looks/sunset.webp for a stock photo without srcSet', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<HeroBlock {...makeProps({ headline: 'X', photos: [SUNSET] })} />);

    const img = screen.getByRole('img', { name: SUNSET.alt });
    expect(img).toHaveAttribute('src', '/site-looks/sunset.webp');
    expect(img).not.toHaveAttribute('srcset');
    expect(img).not.toHaveAttribute('sizes');
    // A parse failure would have logged and rendered nothing.
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("gives a stock photo its file's own width and height, so the box is right before it loads", () => {
    render(<HeroBlock {...makeProps({ headline: 'X', photos: [PALMS] })} />);
    const img = screen.getByRole('img', { name: PALMS.alt });
    expect(img).toHaveAttribute('src', '/site-looks/palms.webp');
    expect(img).toHaveAttribute('width', '1100');
    expect(img).toHaveAttribute('height', '1100');
  });

  it('serves a stock photo from the site, never from storage, even with a CDN configured', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    render(<HeroBlock {...makeProps({ headline: 'X', photos: [SUNSET] })} />);
    expect(screen.getByRole('img', { name: SUNSET.alt })).toHaveAttribute(
      'src',
      '/site-looks/sunset.webp',
    );
  });

  it('mixes stock photos and uploads in one strip, each served its own way', () => {
    render(
      <HeroBlock
        {...makeProps({
          headline: 'X',
          photos: [SUNSET, { path: '1/hero/pool.jpg', alt: 'The pool' }, PALMS],
        })}
      />,
    );

    expect(screen.getByRole('group', { name: 'Community photos, 3 total' })).toBeInTheDocument();
    const sunset = screen.getByRole('img', { name: SUNSET.alt });
    expect(sunset).toHaveAttribute('src', '/site-looks/sunset.webp');
    expect(sunset).not.toHaveAttribute('srcset');
    expect(screen.getByRole('img', { name: 'The pool' })).toHaveAttribute(
      'srcset',
      expect.stringContaining('1/hero/pool.jpg.800w.webp 800w'),
    );
    expect(screen.getByRole('img', { name: PALMS.alt })).toHaveAttribute(
      'src',
      '/site-looks/palms.webp',
    );
    // Every slide and dot still has its own target.
    expect(screen.getByRole('link', { name: 'Go to photo 3 of 3' })).toHaveAttribute(
      'href',
      '#hero-10-photo-2',
    );
  });

  it('renders the same stock photo twice, each a slide of its own', () => {
    render(<HeroBlock {...makeProps({ headline: 'X', photos: [SUNSET, SUNSET] })} />);
    expect(screen.getAllByRole('img', { name: SUNSET.alt })).toHaveLength(2);
    expect(screen.getByRole('group', { name: 'Photo 2 of 2' })).toBeInTheDocument();
  });
});
