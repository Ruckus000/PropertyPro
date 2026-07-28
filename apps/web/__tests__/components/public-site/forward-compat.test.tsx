/**
 * Forward-compatibility — the rollback contract for the content release.
 *
 * ## Why this file exists
 *
 * Every block content schema is `.strict()`, so an unrecognised key is a hard
 * `safeParse` failure rather than a stripped key. That has a consequence that
 * is easy to miss and expensive to discover:
 *
 *   - renderers return `null` on a parse failure, so the section silently
 *     disappears behind an HTTP 200 — including on `documents` and `meetings`,
 *     which are statutory-transparency sections;
 *   - `siteIssues` validates EVERY live row for a community, not just the one
 *     being edited (`lib/services/site-blocks-service.ts`), and any schema
 *     failure is `severity: 'error'`, which `publishBlocked` turns into a
 *     refusal. One unreadable row therefore freezes ALL site publishing for
 *     that community — they cannot even fix forward.
 *
 * `docs/DEPLOYMENT.md` documents Vercel instant rollback as standard incident
 * response, so "the running code is one release behind the rows in the
 * database" is a routine state, not a hypothetical.
 *
 * This release is the READER half of the content additions: it teaches every
 * schema, renderer and registry about `photos`, `variant`, `emptyText` and the
 * `payments` block, while shipping nothing that writes them. The editor forms
 * that produce these shapes land in the NEXT release. That ordering is what
 * makes the next release safe to roll back — and these tests are the assertion
 * that the ordering actually bought us something.
 *
 * **If any test in this file fails, the writer release is not safe to roll
 * back.** Do not delete this file when the writer release ships; its value is
 * entirely in outliving it.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { siteIssues } from '@propertypro/shared';

// `blockRendererRegistry` statically imports the four async system-of-record
// shells, which construct a DB client at module scope — so importing it here
// makes this file fail at module load in CI's DB-less unit job. Same mock, for
// the same reason, as `view-registry.test.ts`.
vi.mock('@/lib/db/public-community-reader', () => ({
  getPublicCommunityScopedReader: vi.fn(),
}));

import { HeroBlock } from '@/components/public-site/blocks/HeroBlock';
import { TextBlock } from '@/components/public-site/blocks/TextBlock';
import { ImageBlock } from '@/components/public-site/blocks/ImageBlock';
import { AmenitiesBlock } from '@/components/public-site/blocks/AmenitiesBlock';
import { PaymentsBlock } from '@/components/public-site/blocks/PaymentsBlock';
import { MeetingsBlockView } from '@/components/public-site/blocks/MeetingsBlockView';
import { hasRenderer } from '@/components/public-site/blocks/registry';
import { hasView } from '@/components/public-site/blocks/view-registry';
import type { BlockRendererProps, PublicCommunity } from '@/components/public-site/blocks/types';

const community: PublicCommunity = {
  id: 7,
  slug: 'sunset-condos',
  name: 'Sunset Condos',
  logoUrl: null,
  communityType: 'condo_718',
  city: 'Miami',
  state: 'FL',
  timezone: 'America/New_York',
};
const theme = {
  primaryColor: '#000',
  secondaryColor: '#fff',
  accentColor: '#0f0',
  headingFont: 'Inter',
  bodyFont: 'Inter',
};

function props(blockType: string, content: unknown): BlockRendererProps {
  return {
    block: { id: 1, blockType, blockOrder: 2, content },
    community,
    theme,
    layout: 'tidewater',
  };
}

/**
 * Exactly the rows the writer release will produce. Written as literals rather
 * than built from the forms, so this file keeps testing the shapes even after
 * the forms change.
 */
const NEW_SHAPE_ROWS = {
  hero: {
    headline: 'Welcome to Sunset Condos',
    photos: [
      { path: '7/hero/pool.jpg', alt: 'The pool' },
      { path: '7/hero/gym.jpg', decorative: true as const },
    ],
  },
  text: { body: 'A genuinely useful paragraph about the community.', variant: 'wide' as const },
  image: { imagePath: '7/content/lobby.jpg', altText: 'The lobby', variant: 'compact' as const },
  amenities: { items: [{ name: 'Pool' }], variant: 'wide' as const },
  meetings: { limit: 10, timeWindowDays: 30, emptyText: 'No meetings scheduled this quarter.' },
  payments: { heading: 'Pay your assessment', ctaTarget: 'https://x.clickpay.com' },
};

describe('forward-compat — renderers understand every new shape', () => {
  it('renders a hero carrying a photo array', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<HeroBlock {...props('hero', NEW_SHAPE_ROWS.hero)} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome to Sunset Condos');
    expect(screen.getByAltText('The pool')).toBeInTheDocument();
    // A parse failure would have logged and rendered nothing.
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('renders text / image / amenities carrying a layout variant', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<TextBlock {...props('text', NEW_SHAPE_ROWS.text)} />);
    expect(screen.getByText(NEW_SHAPE_ROWS.text.body)).toBeInTheDocument();

    const image = render(<ImageBlock {...props('image', NEW_SHAPE_ROWS.image)} />);
    expect(image.container.querySelector('img')).not.toBeNull();

    render(<AmenitiesBlock {...props('amenities', NEW_SHAPE_ROWS.amenities)} />);
    expect(screen.getByText('Pool')).toBeInTheDocument();

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('renders a system-of-record block carrying custom empty copy', () => {
    // documents/meetings are statutory sections — a silent disappearance here
    // is a compliance-visible outage, not a cosmetic one.
    render(
      <MeetingsBlockView
        blockId={3}
        content={NEW_SHAPE_ROWS.meetings}
        data={[]}
        community={community}
      />,
    );
    expect(screen.getByText('No meetings scheduled this quarter.')).toBeInTheDocument();
  });

  it('renders a payments block', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<PaymentsBlock {...props('payments', NEW_SHAPE_ROWS.payments)} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://x.clickpay.com');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('has a renderer AND a canvas view registered for payments', () => {
    // A type the public site can render but the canvas cannot shows up as a
    // hole in the editor preview with no other symptom.
    expect(hasRenderer('payments')).toBe(true);
    expect(hasView('payments')).toBe(true);
  });
});

describe('forward-compat — the publish gate accepts every new shape', () => {
  // `publishBlocked` is "any issue of severity error", and siteIssues walks
  // every live row — so a single unreadable row freezes publishing for the
  // whole community. These assert that none of the new shapes does that.
  const errorsFor = (snapshot: unknown) =>
    siteIssues(snapshot as never).filter((issue) => issue.severity === 'error');

  it('accepts a site built entirely from new-shape rows', () => {
    const snapshot = {
      hero: { slot: 1, blockType: 'hero', content: NEW_SHAPE_ROWS.hero },
      sections: [
        { slot: 2, blockType: 'text', content: NEW_SHAPE_ROWS.text },
        { slot: 3, blockType: 'image', content: NEW_SHAPE_ROWS.image },
        { slot: 4, blockType: 'amenities', content: NEW_SHAPE_ROWS.amenities },
        { slot: 5, blockType: 'meetings', content: NEW_SHAPE_ROWS.meetings },
        { slot: 6, blockType: 'payments', content: NEW_SHAPE_ROWS.payments },
      ],
    };
    expect(errorsFor(snapshot)).toEqual([]);
  });

  it('accepts each new shape on its own, so a failure names the culprit', () => {
    for (const [blockType, content] of Object.entries(NEW_SHAPE_ROWS)) {
      if (blockType === 'hero') continue;
      const snapshot = {
        hero: { slot: 1, blockType: 'hero', content: { headline: 'Welcome home' } },
        sections: [{ slot: 2, blockType, content }],
      };
      expect(errorsFor(snapshot), `${blockType} would block publish site-wide`).toEqual([]);
    }
  });
});

describe('forward-compat — the legacy shapes still work', () => {
  // The other direction: this release must not break rows written BEFORE it.
  it('still renders a legacy single-image hero', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <HeroBlock
        {...props('hero', {
          headline: 'Welcome home',
          heroImagePath: '7/hero/pool.jpg',
          heroImageAlt: 'The pool',
        })}
      />,
    );
    expect(screen.getByAltText('The pool')).toBeInTheDocument();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('still accepts a site with no new-shape fields anywhere', () => {
    const snapshot = {
      hero: { slot: 1, blockType: 'hero', content: { headline: 'Welcome home' } },
      sections: [{ slot: 2, blockType: 'text', content: { body: 'A useful paragraph here.' } }],
    };
    expect(siteIssues(snapshot as never).filter((i) => i.severity === 'error')).toEqual([]);
  });
});
