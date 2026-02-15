import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HeroSection } from '../../src/components/marketing/hero-section';
import { FeaturesSection } from '../../src/components/marketing/features-section';
import { PricingSection } from '../../src/components/marketing/pricing-section';
import { ComplianceUrgencySection } from '../../src/components/marketing/compliance-urgency-section';
import { MarketingFooter } from '../../src/components/marketing/footer';

describe('marketing landing page', () => {
  describe('HeroSection', () => {
    it('renders the compliance headline', () => {
      const html = renderToStaticMarkup(<HeroSection />);
      expect(html).toContain('Required by Florida Law');
    });

    it('renders the $50/day penalty detail', () => {
      const html = renderToStaticMarkup(<HeroSection />);
      expect(html).toContain('$50 per day');
    });

    it('renders the primary CTA linking to signup', () => {
      const html = renderToStaticMarkup(<HeroSection />);
      expect(html).toContain('Get Compliant Now');
      expect(html).toContain('href="/signup"');
    });

    it('renders trust indicators', () => {
      const html = renderToStaticMarkup(<HeroSection />);
      expect(html).toContain('No setup fees');
      expect(html).toContain('14-day free trial');
      expect(html).toContain('Cancel anytime');
    });

    it('references Florida Statute section 718', () => {
      const html = renderToStaticMarkup(<HeroSection />);
      expect(html).toContain('718.111(12)(g)');
    });
  });

  describe('FeaturesSection', () => {
    it('renders all six features', () => {
      const html = renderToStaticMarkup(<FeaturesSection />);
      expect(html).toContain('Document Management');
      expect(html).toContain('Meeting Notices');
      expect(html).toContain('Owner Portal');
      expect(html).toContain('Mobile App');
      expect(html).toContain('Compliance Dashboard');
      expect(html).toContain('Property Manager Tools');
    });

    it('renders the section heading', () => {
      const html = renderToStaticMarkup(<FeaturesSection />);
      expect(html).toContain('Everything Your Association Needs');
    });

    it('includes the features anchor id', () => {
      const html = renderToStaticMarkup(<FeaturesSection />);
      expect(html).toContain('id="features"');
    });
  });

  describe('PricingSection', () => {
    it('renders all four pricing tiers', () => {
      const html = renderToStaticMarkup(<PricingSection />);
      expect(html).toContain('Compliance Basic');
      expect(html).toContain('Compliance + Mobile');
      expect(html).toContain('Full Platform');
      expect(html).toContain('Property Manager');
    });

    it('renders pricing amounts', () => {
      const html = renderToStaticMarkup(<PricingSection />);
      expect(html).toContain('$99');
      expect(html).toContain('$199');
      expect(html).toContain('$349');
    });

    it('renders Contact Us for property manager tier', () => {
      const html = renderToStaticMarkup(<PricingSection />);
      expect(html).toContain('Contact Us');
      expect(html).toContain('Contact Sales');
    });

    it('renders CTA buttons linking to signup', () => {
      const html = renderToStaticMarkup(<PricingSection />);
      expect(html).toContain('Start Free Trial');
      expect(html).toContain('href="/signup"');
    });

    it('marks Compliance + Mobile as most popular', () => {
      const html = renderToStaticMarkup(<PricingSection />);
      expect(html).toContain('Most Popular');
    });

    it('includes the pricing anchor id', () => {
      const html = renderToStaticMarkup(<PricingSection />);
      expect(html).toContain('id="pricing"');
    });
  });

  describe('ComplianceUrgencySection', () => {
    it('references Florida Statute 718', () => {
      const html = renderToStaticMarkup(<ComplianceUrgencySection />);
      expect(html).toContain('718.111(12)(g)');
    });

    it('references Florida Statute 720 for HOAs', () => {
      const html = renderToStaticMarkup(<ComplianceUrgencySection />);
      expect(html).toContain('720.303(4)');
    });

    it('mentions the January 2026 deadline', () => {
      const html = renderToStaticMarkup(<ComplianceUrgencySection />);
      expect(html).toContain('January 1, 2026');
    });

    it('mentions the 25-149 unit threshold', () => {
      const html = renderToStaticMarkup(<ComplianceUrgencySection />);
      expect(html).toContain('25-149 unit');
    });

    it('mentions 150+ units as currently required', () => {
      const html = renderToStaticMarkup(<ComplianceUrgencySection />);
      expect(html).toContain('150+ unit');
    });

    it('mentions 100+ parcel HOA threshold', () => {
      const html = renderToStaticMarkup(<ComplianceUrgencySection />);
      expect(html).toContain('100+ parcel');
    });

    it('describes penalty details', () => {
      const html = renderToStaticMarkup(<ComplianceUrgencySection />);
      expect(html).toContain('$50 per day');
      expect(html).toContain('30 days');
    });

    it('lists required document categories', () => {
      const html = renderToStaticMarkup(<ComplianceUrgencySection />);
      expect(html).toContain('Governing Documents');
      expect(html).toContain('Financial Records');
      expect(html).toContain('Meeting Materials');
      expect(html).toContain('Contracts');
    });

    it('includes the compliance anchor id', () => {
      const html = renderToStaticMarkup(<ComplianceUrgencySection />);
      expect(html).toContain('id="compliance"');
    });
  });

  describe('MarketingFooter', () => {
    it('renders company name', () => {
      const html = renderToStaticMarkup(<MarketingFooter />);
      expect(html).toContain('PropertyPro');
      expect(html).toContain('Florida');
    });

    it('renders Terms of Service link', () => {
      const html = renderToStaticMarkup(<MarketingFooter />);
      expect(html).toContain('Terms of Service');
      expect(html).toContain('href="/legal/terms"');
    });

    it('renders Privacy Policy link', () => {
      const html = renderToStaticMarkup(<MarketingFooter />);
      expect(html).toContain('Privacy Policy');
      expect(html).toContain('href="/legal/privacy"');
    });

    it('renders contact information', () => {
      const html = renderToStaticMarkup(<MarketingFooter />);
      expect(html).toContain('support@propertyprofl.com');
      expect(html).toContain('West Palm Beach, FL');
    });

    it('renders copyright notice', () => {
      const html = renderToStaticMarkup(<MarketingFooter />);
      expect(html).toContain('All rights reserved');
    });

    it('includes the legal disclaimer', () => {
      const html = renderToStaticMarkup(<MarketingFooter />);
      expect(html).toContain('not a law firm');
    });

    it('renders product navigation links', () => {
      const html = renderToStaticMarkup(<MarketingFooter />);
      expect(html).toContain('href="#features"');
      expect(html).toContain('href="#pricing"');
      expect(html).toContain('href="#compliance"');
    });
  });
});
