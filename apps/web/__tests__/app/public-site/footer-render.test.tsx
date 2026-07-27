/**
 * Website editor v3, Phase 8 — the public site footer.
 *
 * Two things are being protected here.
 *
 * The statutory records line is OPT-IN and must stay that way. A community that
 * has never made that choice — including one whose stored footer object is
 * malformed — must not have a statutory claim published under its name. That is
 * a compliance constraint (gap analysis §5,
 * `.claude/rules/florida-compliance.md`), not a preference, so the default is
 * pinned from several directions rather than once.
 *
 * And `note` is PM-authored free text on an unauthenticated page with no review
 * step, so the escaping is asserted against a real payload rather than assumed
 * from "React escapes by default".
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PublicSiteFooter } from '@/components/public-site/PublicSiteFooter';
import { STATUTORY_FOOTER_LINE, resolveFooterSettings } from '@/lib/site-editor/site-settings';

const COMMUNITY = 'Sunset Condos';

describe('PublicSiteFooter — the pre-Phase-8 shape still renders', () => {
  it('shows the community name, the year and the PropertyPro credit', () => {
    render(<PublicSiteFooter communityName={COMMUNITY} />);
    const year = new Date().getFullYear();
    expect(screen.getByText(`© ${year} ${COMMUNITY}. All rights reserved.`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'PropertyPro' })).toHaveAttribute(
      'href',
      'https://getpropertypro.com',
    );
  });

  it('renders nothing extra when no Phase 8 props are passed', () => {
    render(<PublicSiteFooter communityName={COMMUNITY} />);
    expect(screen.queryByText(STATUTORY_FOOTER_LINE)).not.toBeInTheDocument();
  });
});

describe('PublicSiteFooter — association name', () => {
  it('overrides the community name in the copyright line', () => {
    render(
      <PublicSiteFooter communityName={COMMUNITY} associationName="Sunset Owners Association" />,
    );
    const year = new Date().getFullYear();
    expect(
      screen.getByText(`© ${year} Sunset Owners Association. All rights reserved.`),
    ).toBeInTheDocument();
  });

  // The common case in Florida: the registered entity name already ends in a
  // period, and blindly appending one gives "Inc.. All rights reserved."
  it('does not double the period when the name already ends in one', () => {
    render(
      <PublicSiteFooter
        communityName={COMMUNITY}
        associationName="Sunset Condominium Association, Inc."
      />,
    );
    const year = new Date().getFullYear();
    expect(
      screen.getByText(`© ${year} Sunset Condominium Association, Inc. All rights reserved.`),
    ).toBeInTheDocument();
  });

  it.each([null, undefined, '', '   '])(
    'falls back to the community name rather than printing an empty owner (%s)',
    (value) => {
      render(<PublicSiteFooter communityName={COMMUNITY} associationName={value} />);
      const year = new Date().getFullYear();
      expect(screen.getByText(`© ${year} ${COMMUNITY}. All rights reserved.`)).toBeInTheDocument();
    },
  );
});

describe('PublicSiteFooter — note', () => {
  it('renders the note when set', () => {
    render(<PublicSiteFooter communityName={COMMUNITY} note="Managed by Acme Property Group." />);
    expect(screen.getByText('Managed by Acme Property Group.')).toBeInTheDocument();
  });

  it.each([null, undefined, '', '   '])('renders nothing for %s', (value) => {
    const { container } = render(<PublicSiteFooter communityName={COMMUNITY} note={value} />);
    expect(container.querySelectorAll('p')).toHaveLength(0);
  });

  // The footer note is PM-authored, unreviewed, and lands on an anonymous page.
  it('renders a script payload as visible text and creates no script element', () => {
    const payload = '<script>window.__pwned = true</script>';
    const { container } = render(<PublicSiteFooter communityName={COMMUNITY} note={payload} />);

    expect(screen.getByText(payload)).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect((window as unknown as Record<string, unknown>).__pwned).toBeUndefined();
  });

  it('does not turn an img payload into an element either', () => {
    const payload = '<img src=x onerror="alert(1)">';
    const { container } = render(<PublicSiteFooter communityName={COMMUNITY} note={payload} />);
    expect(screen.getByText(payload)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('PublicSiteFooter — the statutory line is opt-in', () => {
  it('is absent by default', () => {
    render(<PublicSiteFooter communityName={COMMUNITY} />);
    expect(screen.queryByText(STATUTORY_FOOTER_LINE)).not.toBeInTheDocument();
  });

  it.each([false, undefined])('is absent when showStatutoryLine is %s', (value) => {
    render(<PublicSiteFooter communityName={COMMUNITY} showStatutoryLine={value} />);
    expect(screen.queryByText(STATUTORY_FOOTER_LINE)).not.toBeInTheDocument();
  });

  it('appears, with the exact §5 wording, only on an explicit opt-in', () => {
    render(<PublicSiteFooter communityName={COMMUNITY} showStatutoryLine />);
    expect(
      screen.getByText('Records maintained under Fla. Stat. §718.111(12)(g)'),
    ).toBeInTheDocument();
  });

  // End to end from the stored blob: a malformed or truthy-but-not-true stored
  // value must not publish a statutory claim under the association's name.
  it.each([
    ['a missing key', {}],
    ['the string "true"', { siteFooter: { showStatutoryLine: 'true' } }],
    ['the number 1', { siteFooter: { showStatutoryLine: 1 } }],
    ['a malformed siteFooter', { siteFooter: 'yes' }],
    ['malformed branding', 'nonsense'],
  ])('stays off when branding carries %s', (_label, branding) => {
    const footer = resolveFooterSettings(branding);
    render(<PublicSiteFooter communityName={COMMUNITY} showStatutoryLine={footer.showStatutoryLine} />);
    expect(screen.queryByText(STATUTORY_FOOTER_LINE)).not.toBeInTheDocument();
  });
});

describe('PublicSiteFooter — everything at once', () => {
  it('renders the note above the statutory line', () => {
    const { container } = render(
      <PublicSiteFooter
        communityName={COMMUNITY}
        associationName="Sunset Condominium Association, Inc."
        note="Managed by Acme Property Group."
        showStatutoryLine
      />,
    );
    const paragraphs = [...container.querySelectorAll('p')].map((p) => p.textContent);
    expect(paragraphs).toEqual(['Managed by Acme Property Group.', STATUTORY_FOOTER_LINE]);
  });
});
