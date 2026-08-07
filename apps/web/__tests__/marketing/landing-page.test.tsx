import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HeroSection } from '../../src/components/marketing/hero-section';
import { FeaturesSection } from '../../src/components/marketing/features-section';
import { PricingSection } from '../../src/components/marketing/pricing-section';
import { ComplianceUrgencySection } from '../../src/components/marketing/compliance-urgency-section';
import { MarketingFooter } from '../../src/components/marketing/footer';
import { PortfolioCard } from '../../src/components/marketing/portfolio-card';
import { MarketingNav } from '../../src/components/marketing/marketing-nav';
import { LogoProofSection } from '../../src/components/marketing/logo-proof-section';
import { HowItWorksSection } from '../../src/components/marketing/how-it-works-section';
import { TestimonialSection } from '../../src/components/marketing/testimonial-section';
import { FaqSection } from '../../src/components/marketing/faq-section';
import { FinalCtaSection } from '../../src/components/marketing/final-cta-section';

describe('PortfolioCard', () => {
  it('renders an aggregate portfolio score and multiple communities', () => {
    const html = renderToStaticMarkup(<PortfolioCard />);
    expect(html).toContain('Portfolio compliance');
    expect(html).toContain('Sunset Condos');
    expect(html).toContain('Palm Shores');
  });
});

describe('MarketingNav', () => {
  it('renders absolute in-page anchor links and CTAs', () => {
    const html = renderToStaticMarkup(<MarketingNav />);
    expect(html).toContain('href="/#features"');
    expect(html).toContain('href="/#compliance"');
    expect(html).toContain('href="/#pricing"');
    expect(html).toContain('For managers');
    expect(html).toContain('href="/auth/login"');
    expect(html).toContain('href="/signup"');
  });
});

describe('LogoProofSection', () => {
  it('labels illustrative management-company names', () => {
    const html = renderToStaticMarkup(<LogoProofSection />);
    expect(html.toLowerCase()).not.toContain(
      'trusted by management companies across florida',
    );
    expect(
      html.toLowerCase().includes('illustrative') ||
        html.toLowerCase().includes('example'),
    ).toBe(true);
    expect(html).toContain('Gulfstream Management');
  });
});

describe('PricingSection trial truth', () => {
  it('states card required and does not claim no card', () => {
    const html = renderToStaticMarkup(<PricingSection />);
    expect(html.toLowerCase()).toContain('card required');
    expect(html.toLowerCase()).not.toContain('no card required');
    expect(html).toMatch(/30-day/i);
  });
});

describe('HeroSection trial truth', () => {
  it('shows 30-day trial without no-card claim', () => {
    const html = renderToStaticMarkup(<HeroSection />);
    expect(html).toMatch(/30-day/i);
    expect(html.toLowerCase()).not.toContain('no card');
  });
});

describe('marketing landing page', () => {
  describe('HeroSection', () => {
    it('renders the portfolio-first headline', () => {
      const html = renderToStaticMarkup(<HeroSection />);
      expect(html).toContain('portfolio');
    });

    it('frames the deadline copy in present tense', () => {
      const html = renderToStaticMarkup(<HeroSection />);
      expect(html).toContain('compliant by');
      expect(html).toContain('default');
      // Stale future-deadline framing should be gone.
      expect(html).not.toContain('2026');
    });

    it('renders only the primary CTA (no 2-min tour button)', () => {
      const html = renderToStaticMarkup(<HeroSection />);
      expect(html).toContain('Get your portfolio online');
      expect(html).not.toContain('2-min tour');
    });

    it('welcomes self-managed boards as a secondary line', () => {
      const html = renderToStaticMarkup(<HeroSection />);
      // case-insensitive: rendered copy is "Self-managed boards…"
      expect(html.toLowerCase()).toContain('self-managed board');
    });

    it('renders the primary CTA linking to signup', () => {
      const html = renderToStaticMarkup(<HeroSection />);
      expect(html).toContain('href="/signup"');
    });

    it('renders trust indicators', () => {
      const html = renderToStaticMarkup(<HeroSection />);
      expect(html).toContain('30-day free trial');
      expect(html).toContain('No setup fees');
    });

    it('embeds the portfolio product card', () => {
      const html = renderToStaticMarkup(<HeroSection />);
      expect(html).toContain('Portfolio compliance');
    });

    it('uses the #top anchor', () => {
      const html = renderToStaticMarkup(<HeroSection />);
      expect(html).toContain('id="top"');
    });
  });

  describe('FeaturesSection', () => {
    it('leads with the portfolio compliance hero feature', () => {
      const html = renderToStaticMarkup(<FeaturesSection />);
      expect(html).toContain('Portfolio compliance, one view');
    });

    it('renders the six supporting feature cards', () => {
      const html = renderToStaticMarkup(<FeaturesSection />);
      expect(html).toContain('Document management');
      expect(html).toContain('Meeting notices');
      expect(html).toContain('Owner portal');
      expect(html).toContain('Mobile access');
      expect(html).toContain('Announcements');
      expect(html).toContain('Compliance dashboard');
    });

    it('includes the features and managers anchors', () => {
      const html = renderToStaticMarkup(<FeaturesSection />);
      expect(html).toContain('id="features"');
      expect(html).toContain('id="managers"');
    });
  });

  describe('PricingSection', () => {
    it('renders all three tiers', () => {
      const html = renderToStaticMarkup(<PricingSection />);
      expect(html).toContain('Essentials');
      expect(html).toContain('Professional');
      expect(html).toContain('Property Manager');
    });

    it('renders amounts', () => {
      const html = renderToStaticMarkup(<PricingSection />);
      expect(html).toContain('$199');
      expect(html).toContain('$349');
      // renderToStaticMarkup escapes the apostrophe (&#x27;); normalize before matching.
      expect(html.replace(/&#x27;/g, "'")).toContain("Let's talk");
    });

    it('puts the featured emphasis on Essentials, not the PM tier', () => {
      // The PM tier used to carry it while routing to a mailto with no funnel
      // behind it. We sell through the board channel, and Essentials is what a
      // self-managed 25–149 unit board buys (docs/gtm/01-RECONCILIATION.md §5).
      const html = renderToStaticMarkup(<PricingSection />);
      expect(html).toContain('Where most self-managed boards start');
      expect(html).not.toContain('Recommended for portfolios');
    });

    it('keeps the ribbon and the featured border on the same card', () => {
      // Only `.mk-price.mk-feat` sets position:relative, and `.mk-ribbon` is
      // absolutely positioned — split them and the badge floats off.
      const html = renderToStaticMarkup(<PricingSection />);
      const featuredCard = html
        .split('class="mk-card mk-price')
        .find((chunk) => chunk.startsWith(' mk-feat'));
      expect(featuredCard).toContain('Where most self-managed boards start');
    });

    it('includes the pricing anchor id and signup CTA', () => {
      const html = renderToStaticMarkup(<PricingSection />);
      expect(html).toContain('id="pricing"');
      // B5: Essentials/Professional "Start free trial" CTAs deep-link the chosen
      // plan + community type into signup (form seeds planKey from ?plan=).
      expect(html).toContain('href="/signup?plan=essentials&amp;communityType=condo_718"');
      expect(html).toContain('href="/signup?plan=professional&amp;communityType=condo_718"');
    });

    it('routes the Property Manager CTA to the inbound form, not a mailto', () => {
      // B3: the most prominent CTA on the page used to open an email client and
      // leave no record. It now lands in marketing_leads like everything else.
      const html = renderToStaticMarkup(<PricingSection />);
      expect(html).toContain('href="/contact"');
      expect(html).not.toContain('mailto:');
    });
  });

  describe('ComplianceUrgencySection', () => {
    it('keeps the relief framing headline', () => {
      const html = renderToStaticMarkup(<ComplianceUrgencySection />);
      expect(html).toContain('on autopilot');
    });

    it('retains the 30-day statute fact', () => {
      const html = renderToStaticMarkup(<ComplianceUrgencySection />);
      expect(html).toContain('30 days');
    });

    it('makes no penalty claim', () => {
      // The "$50/day penalty" this used to assert is records-request damages
      // under §718.111(12)(c) — capped at 10 days and unrelated to whether a
      // website exists. There is no automatic fine for lacking one.
      const html = renderToStaticMarkup(<ComplianceUrgencySection />);
      expect(html).not.toContain('$50');
      expect(html).not.toMatch(/per day/i);
      expect(html).not.toMatch(/penalty|fine/i);
    });

    it('references the §718/§720 framework', () => {
      const html = renderToStaticMarkup(<ComplianceUrgencySection />);
      expect(html).toContain('718');
      expect(html).toContain('720');
    });

    it('embeds the checker prompt', () => {
      const html = renderToStaticMarkup(<ComplianceUrgencySection />);
      expect(html).toContain('Is your association required to comply');
    });

    it('keeps the compliance anchor id', () => {
      const html = renderToStaticMarkup(<ComplianceUrgencySection />);
      expect(html).toContain('id="compliance"');
    });
  });

  describe('MarketingFooter', () => {
    it('renders the company name', () => {
      const html = renderToStaticMarkup(<MarketingFooter />);
      expect(html).toContain('PropertyPro');
    });

    it('keeps the legal links', () => {
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
      expect(html).toContain('href="/#features"');
      expect(html).toContain('href="/#pricing"');
    });
  });
});

describe('HowItWorksSection', () => {
  it('renders three portfolio-scale steps with the #how anchor', () => {
    const html = renderToStaticMarkup(<HowItWorksSection />);
    expect(html).toContain('id="how"');
    expect(html).toContain('Onboard a community');
    expect(html).toContain('Bulk-load');
    expect(html).toContain('Invite boards');
  });
});

describe('TestimonialSection', () => {
  it('renders a property-manager quote and attribution', () => {
    const html = renderToStaticMarkup(<TestimonialSection />);
    expect(html).toContain('buildings');
    expect(html).toContain('Property Manager');
  });
});

describe('FaqSection', () => {
  it('answers the core board/PM objections', () => {
    const html = renderToStaticMarkup(<FaqSection />);
    expect(html).toContain('required to have a website');
    expect(html).toContain('technical');
    expect(html).toContain('secure');
    expect(html).toContain('already has a website');
  });

  it('exposes the #faq deep-link anchor', () => {
    const html = renderToStaticMarkup(<FaqSection />);
    expect(html).toContain('id="faq"');
  });

  it('keeps answer text in the static markup for SEO (hidden, not removed)', () => {
    const html = renderToStaticMarkup(<FaqSection />);
    // Reframed present-tense answer #1 — not the old "must comply by Jan 1, 2026".
    expect(html).toContain('required to maintain a compliant website');
    expect(html).not.toContain('must comply by Jan 1, 2026');
    // Answers ship hidden by default; the text stays crawlable.
    expect(html).toContain('hidden');
  });

  it('renders questions as real accordion buttons', () => {
    const html = renderToStaticMarkup(<FaqSection />);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="faq-answer-0"');
  });
});

describe('FinalCtaSection', () => {
  it('renders a closing CTA linking to signup', () => {
    const html = renderToStaticMarkup(<FinalCtaSection />);
    expect(html).toContain('Beat the deadline');
    // "Get your portfolio online" still points to signup.
    expect(html).toContain('href="/signup"');
  });

  it('points the "Talk to us" CTA at the inbound form', () => {
    const html = renderToStaticMarkup(<FinalCtaSection />);
    expect(html).toContain('Talk to us');
    expect(html).toContain('href="/contact"');
    expect(html).not.toContain('mailto:');
  });

  it('does not claim an existing customer base', () => {
    // Same defect class as the fabricated testimonial and logo strip that were
    // un-rendered from the landing page — see (marketing)/page.tsx.
    const html = renderToStaticMarkup(<FinalCtaSection />);
    expect(html).not.toMatch(/join the florida management companies/i);
  });
});
