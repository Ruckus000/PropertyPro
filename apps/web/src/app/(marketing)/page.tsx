import { MarketingNav } from '@/components/marketing/marketing-nav';
import { HeroSection } from '@/components/marketing/hero-section';
import { LogoProofSection } from '@/components/marketing/logo-proof-section';
import { ComplianceUrgencySection } from '@/components/marketing/compliance-urgency-section';
import { HowItWorksSection } from '@/components/marketing/how-it-works-section';
import { FeaturesSection } from '@/components/marketing/features-section';
import { TestimonialSection } from '@/components/marketing/testimonial-section';
import { PricingSection } from '@/components/marketing/pricing-section';
import { FaqSection } from '@/components/marketing/faq-section';
import { FinalCtaSection } from '@/components/marketing/final-cta-section';
import { MarketingFooter } from '@/components/marketing/footer';

export default function MarketingLandingPage() {
  return (
    <>
      <MarketingNav />
      <main id="main-content">
        <HeroSection />
        <LogoProofSection />
        <ComplianceUrgencySection />
        <HowItWorksSection />
        <FeaturesSection />
        <TestimonialSection />
        <PricingSection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <MarketingFooter />
    </>
  );
}
