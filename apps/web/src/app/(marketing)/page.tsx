import { MarketingNav } from '@/components/marketing/marketing-nav';
import { HeroSection } from '@/components/marketing/hero-section';
import { WhoSection } from '@/components/marketing/who-section';
import { StatuteSection } from '@/components/marketing/statute-section';
import { RecordsBand } from '@/components/marketing/records-band';
import { ReckoningSection } from '@/components/marketing/reckoning-section';
import { ProductSection } from '@/components/marketing/product-section';
import { OnboardingSection } from '@/components/marketing/onboarding-section';
import { PortfolioSection } from '@/components/marketing/portfolio-section';
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
        {/*
          LogoProofSection and TestimonialSection are unrendered until real
          customer proof exists. Both shipped placeholder content — the
          testimonial was a fully attributed quote (named person, named firm)
          from nobody, and the logo strip listed invented management companies.
          We sell a compliance and records-integrity product to fiduciaries, so
          fabricated proof on our own homepage attacks the exact attribute the
          product is bought for. Restore each once a real customer has agreed in
          writing. See docs/gtm/03-LAUNCH-READINESS.md item B4.

          The v6 landing has no proof section at all, which is why neither is
          slotted in below. The components and their CSS stay in the tree so
          that decision remains visible rather than silently reversed.
        */}
        <HeroSection />
        <WhoSection />
        <StatuteSection />
        <RecordsBand />
        <ReckoningSection />
        <ProductSection />
        <OnboardingSection />
        <PortfolioSection />
        <PricingSection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <MarketingFooter legalDocs={getLegalDocs()} />
    </>
  );
}
