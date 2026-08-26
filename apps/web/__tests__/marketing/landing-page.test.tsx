import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HeroSection } from '../../src/components/marketing/hero-section';
import { WhoSection } from '../../src/components/marketing/who-section';
import { StatuteSection } from '../../src/components/marketing/statute-section';
import { RecordsBand } from '../../src/components/marketing/records-band';
import { ReckoningSection } from '../../src/components/marketing/reckoning-section';
import { ProductSection } from '../../src/components/marketing/product-section';
import { OnboardingSection } from '../../src/components/marketing/onboarding-section';
import { PortfolioSection } from '../../src/components/marketing/portfolio-section';
import { PricingSection } from '../../src/components/marketing/pricing-section';
import { FaqSection } from '../../src/components/marketing/faq-section';
import { FinalCtaSection } from '../../src/components/marketing/final-cta-section';
import { MarketingFooter } from '../../src/components/marketing/footer';
import { MarketingNav } from '../../src/components/marketing/marketing-nav';
import { LogoProofSection } from '../../src/components/marketing/logo-proof-section';
import { TestimonialSection } from '../../src/components/marketing/testimonial-section';

/** Everything that ships inside <main>, in document order. */
const SECTIONS = [
  HeroSection,
  WhoSection,
  StatuteSection,
  RecordsBand,
  ReckoningSection,
  ProductSection,
  OnboardingSection,
  PortfolioSection,
  PricingSection,
  FaqSection,
  FinalCtaSection,
] as const;

function wholePage(): string {
  return SECTIONS.map((S) => renderToStaticMarkup(<S />)).join('');
}

describe('MarketingNav', () => {
  it('renders absolute in-page anchor links and CTAs', () => {
    const html = renderToStaticMarkup(<MarketingNav />);
    expect(html).toContain('href="/#statute"');
    expect(html).toContain('href="/#product"');
    expect(html).toContain('href="/#portfolio"');
    expect(html).toContain('href="/#pricing"');
    expect(html).toContain('href="/#faq"');
    expect(html).toContain('href="/auth/login"');
    expect(html).toContain('href="/signup"');
  });
});

describe('section anchors', () => {
  it('renders every id the nav and footer link to', () => {
    const html = wholePage();
    for (const id of [
      'top',
      'who',
      'statute',
      'reckoning',
      'product',
      'onboarding',
      'portfolio',
      'pricing',
      'faq',
    ]) {
      expect(html, `missing #${id}`).toContain(`id="${id}"`);
    }
  });

  it('renders exactly one h1', () => {
    expect(wholePage().match(/<h1/g)?.length).toBe(1);
  });
});

describe('photography', () => {
  it('serves every photo from the versioned directory, with a real srcset', () => {
    const html = wholePage();
    for (const name of [
      'who-condo',
      'who-hoa',
      'who-cam',
      'records-band',
      'onboarding',
      'close-coast',
    ]) {
      expect(html, `missing ${name}`).toContain(`/marketing/v1/${name}-`);
    }
    expect(html.match(/<img/g)?.length).toBe(6);
    // width/height on every one — without them the page reflows as photos
    // arrive, and these are the only images the marketing site has.
    expect(html.match(/width="\d+" height="\d+"/g)?.length).toBe(6);
    // Every photo offers at least two widths, or srcset is doing nothing.
    const srcsets = [...html.matchAll(/srcSet="([^"]*)"|srcset="([^"]*)"/g)].map(
      (m) => m[1] ?? m[2],
    );
    expect(srcsets).toHaveLength(6);
    for (const set of srcsets) {
      expect(set.split(',').length).toBeGreaterThanOrEqual(2);
      expect(set).toMatch(/\d+w$/);
    }
    // The version segment is what lets vercel.json mark these immutable; a photo
    // served from an unversioned path would be cached for a year with no way out.
    expect(html).not.toMatch(/\/marketing\/(?!v\d+\/)/);
  });

  it('gives every decorative photo an empty alt and every meaningful one real alt text', () => {
    const html = wholePage();
    const alts = [...html.matchAll(/<img[^>]*\salt="([^"]*)"/g)].map((m) => m[1]);
    expect(alts).toHaveLength(6);
    // The three audience cards carry meaning; the two atmospheric bands do not.
    expect(alts.filter((a) => a.length > 0)).toHaveLength(4);
  });
});

/**
 * Claim truth. Each assertion here corresponds to a claim that was WRONG on a
 * previous version of this page. They are not copy tests — they are the record
 * of what we are not allowed to say again.
 */
describe('claim truth', () => {
  it('states the trial length and that a card is required, and never claims otherwise', () => {
    const pricing = renderToStaticMarkup(<PricingSection />);
    // The exact phrase `activation-smoke.spec.ts` asserts against the built page.
    // Matching its wording here rather than the component's keeps a copy edit from
    // passing the unit test and failing the production smoke test — which is
    // precisely what happened when this line was hand-written.
    expect(pricing.toLowerCase()).toContain('card required');
    expect(pricing.toLowerCase()).not.toContain('no card');
    expect(pricing).toMatch(/30-day/i);

    const hero = renderToStaticMarkup(<HeroSection />);
    expect(hero).toMatch(/30-day/i);
    expect(hero.toLowerCase()).not.toContain('no card');
  });

  it('makes no per-day penalty claim for lacking a website', () => {
    // "$50/day penalty" was records-request damages under §718.111(12)(c),
    // capped at 10 days and unrelated to whether a website exists. There is no
    // automatic fine for lacking one, and the page now says so outright.
    const html = wholePage();
    expect(html).not.toContain('$50');
    expect(html).not.toMatch(/\$\d+\s*(a|per)\s*day/i);
    expect(html).toContain('$0');
    expect(html).toMatch(/Fine for lacking a website/i);
  });

  it('claims no customers, no logos, and no testimonials', () => {
    const html = wholePage();
    expect(html).not.toMatch(/join the florida management companies/i);
    expect(html).not.toMatch(/trusted by/i);
    expect(html).not.toMatch(/customers (say|love)/i);
  });

  it('keeps the featured emphasis on Essentials, not the PM tier', () => {
    // The PM tier used to carry it while routing to a mailto with no funnel
    // behind it. Essentials is what a self-managed 25–149 unit board buys
    // (docs/gtm/01-RECONCILIATION.md §5).
    const html = renderToStaticMarkup(<PricingSection />);
    expect(html).toContain('Where most boards start');
    expect(html).not.toContain('Recommended for portfolios');
  });

  it('labels itself general information rather than legal advice', () => {
    expect(renderToStaticMarkup(<StatuteSection />)).toMatch(
      /not legal advice/i,
    );
  });
});

describe('conversion routing', () => {
  it('deep-links the chosen plan and community type into signup', () => {
    // B5: the signup form seeds planKey from ?plan=.
    const html = renderToStaticMarkup(<PricingSection />);
    expect(html).toContain('href="/signup?plan=essentials&amp;communityType=condo_718"');
    expect(html).toContain('href="/signup?plan=professional&amp;communityType=condo_718"');
  });

  it('routes every "talk to us" CTA to the inbound form, never a mailto', () => {
    // B3: the most prominent CTA on the page used to open an email client and
    // leave no record. Everything now lands in marketing_leads. The v6 mockup
    // used mailto: in four places — none of them may ship.
    const html = wholePage();
    expect(html).not.toContain('mailto:');
    expect(renderToStaticMarkup(<PortfolioSection />)).toContain('href="/contact"');
    expect(renderToStaticMarkup(<FinalCtaSection />)).toContain('href="/contact"');
    expect(renderToStaticMarkup(<PricingSection />)).toContain('href="/contact"');
  });

  it('renders all three pricing tiers and their amounts', () => {
    const html = renderToStaticMarkup(<PricingSection />);
    expect(html).toContain('Essentials');
    expect(html).toContain('Professional');
    expect(html).toContain('Property Manager');
    expect(html).toContain('$199');
    expect(html).toContain('$349');
    // renderToStaticMarkup escapes the apostrophe; normalize before matching.
    expect(html.replace(/&#x27;/g, "'")).toContain("Let's talk");
  });
});

describe('FaqSection', () => {
  it('answers the core board objections', () => {
    const html = renderToStaticMarkup(<FaqSection />);
    expect(html).toContain('required to have a website');
    expect(html).toContain('technical');
    expect(html).toMatch(/Who can see what/i);
    expect(html).toMatch(/already have a website/i);
  });

  it('keeps answer text in the static markup for SEO (hidden, not removed)', () => {
    const html = renderToStaticMarkup(<FaqSection />);
    expect(html).toContain('required to maintain a compliant website');
    expect(html).not.toContain('must comply by Jan 1, 2026');
    expect(html).toContain('hidden');
  });

  it('renders questions as real accordion buttons', () => {
    const html = renderToStaticMarkup(<FaqSection />);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="mk-faq-a0"');
  });
});

describe('MarketingFooter', () => {
  it('keeps the legal links pointing at real documents', () => {
    const html = renderToStaticMarkup(<MarketingFooter />);
    expect(html).toContain('href="/legal/terms"');
    expect(html).toContain('href="/legal/privacy"');
  });

  it('keeps contact + the not-a-law-firm disclaimer', () => {
    const html = renderToStaticMarkup(<MarketingFooter />);
    expect(html).toContain('support@getpropertypro.com');
    expect(html).toContain('West Palm Beach, FL');
    expect(html).toContain('not a law firm');
  });

  it('keeps absolute product anchor links', () => {
    const html = renderToStaticMarkup(<MarketingFooter />);
    expect(html).toContain('href="/#product"');
    expect(html).toContain('href="/#pricing"');
  });
});

/**
 * Both components are deliberately NOT rendered by the landing page — each
 * shipped fabricated proof. They stay in the tree so the decision is visible;
 * these tests keep them honest if anyone restores one. See (marketing)/page.tsx.
 */
describe('un-rendered proof sections', () => {
  it('LogoProofSection labels its management-company names illustrative', () => {
    const html = renderToStaticMarkup(<LogoProofSection />);
    expect(html.toLowerCase()).not.toContain(
      'trusted by management companies across florida',
    );
    expect(
      html.toLowerCase().includes('illustrative') ||
        html.toLowerCase().includes('example'),
    ).toBe(true);
  });

  it('neither is reachable from the shipped page', () => {
    const html = wholePage();
    expect(html).not.toContain(renderToStaticMarkup(<TestimonialSection />));
    expect(html).not.toContain(renderToStaticMarkup(<LogoProofSection />));
  });
});
