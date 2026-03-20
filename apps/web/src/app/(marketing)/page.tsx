import { HeroSection } from '@/components/marketing/hero-section';
import { FeaturesSection } from '@/components/marketing/features-section';
import { PricingSection } from '@/components/marketing/pricing-section';
import { ComplianceUrgencySection } from '@/components/marketing/compliance-urgency-section';
import { MarketingFooter } from '@/components/marketing/footer';

export default function MarketingLandingPage() {
  return (
    <div className="min-h-screen bg-surface-card">
      <MarketingNav />
      <main id="main-content">
        <HeroSection />
        <FeaturesSection />
        <ComplianceUrgencySection />
        <PricingSection />
      </main>
      <MarketingFooter />
    </div>
  );
}

function MarketingNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-edge bg-surface-card/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="/" className="text-lg font-semibold text-content">
          PropertyPro<span className="text-content-link"> Florida</span>
        </a>
        <div className="hidden items-center gap-8 sm:flex">
          <a
            href="#features"
            className="text-sm font-medium text-content-secondary transition-colors hover:text-content"
          >
            Features
          </a>
          <a
            href="#compliance"
            className="text-sm font-medium text-content-secondary transition-colors hover:text-content"
          >
            Compliance
          </a>
          <a
            href="#pricing"
            className="text-sm font-medium text-content-secondary transition-colors hover:text-content"
          >
            Pricing
          </a>
          <a
            href="/auth/login"
            className="text-sm font-medium text-content-secondary transition-colors hover:text-content"
          >
            Log In
          </a>
          <a
            href="/signup"
            className="inline-flex items-center rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse transition-colors hover:bg-interactive-hover"
          >
            Get Started
          </a>
        </div>
        {/* Mobile menu button - shows on small screens */}
        <div className="flex items-center gap-4 sm:hidden">
          <a
            href="/signup"
            className="inline-flex items-center rounded-md bg-interactive px-3 py-2 text-sm font-medium text-content-inverse transition-colors hover:bg-interactive-hover"
          >
            Get Started
          </a>
        </div>
      </div>
    </nav>
  );
}
