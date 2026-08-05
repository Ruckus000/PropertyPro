import { MarketingNav } from '@/components/marketing/marketing-nav';
import { HeroSection } from '@/components/marketing/hero-section';
import { ComplianceUrgencySection } from '@/components/marketing/compliance-urgency-section';
import { HowItWorksSection } from '@/components/marketing/how-it-works-section';
import { FeaturesSection } from '@/components/marketing/features-section';
import { PricingSection } from '@/components/marketing/pricing-section';
import { FaqSection } from '@/components/marketing/faq-section';
import { FinalCtaSection } from '@/components/marketing/final-cta-section';
import { MarketingFooter } from '@/components/marketing/footer';
import { getLegalDocs } from '@/lib/legal-content';

export default function MarketingLandingPage() {
  return (
    <>
      <MarketingNav />
      <main id="main-content">
        <HeroSection />
        {/*
          LogoProofSection and TestimonialSection are unrendered until real
          customer proof exists. Both shipped placeholder content — the
          testimonial was a fully attributed quote (named person, named firm)
          from nobody, and the logo strip listed invented management companies.
          We sell a compliance and records-integrity product to fiduciaries, so
          fabricated proof on our own homepage attacks the exact attribute the
          product is bought for. Restore each once a real customer has agreed in
          writing. See docs/gtm/03-LAUNCH-READINESS.md item B4.
        */}
        <ComplianceUrgencySection />
        <HowItWorksSection />
        <FeaturesSection />
        <PricingSection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <MarketingFooter legalDocs={getLegalDocs()} />
    </>
  );
}
