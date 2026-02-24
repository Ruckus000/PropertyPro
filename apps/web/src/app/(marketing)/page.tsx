import { HeroSection } from '@/components/marketing/hero-section';
import { FeaturesSection } from '@/components/marketing/features-section';
import { PricingSection } from '@/components/marketing/pricing-section';
import { ComplianceUrgencySection } from '@/components/marketing/compliance-urgency-section';
import { MarketingFooter } from '@/components/marketing/footer';

export default function MarketingLandingPage() {
  return (
    <div className="min-h-screen bg-white">
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
    <nav className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="/" className="text-lg font-semibold text-gray-900">
          PropertyPro<span className="text-blue-600"> Florida</span>
        </a>
        <div className="hidden items-center gap-8 sm:flex">
          <a
            href="#features"
            className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
          >
            Features
          </a>
          <a
            href="#compliance"
            className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
          >
            Compliance
          </a>
          <a
            href="#pricing"
            className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
          >
            Pricing
          </a>
          <a
            href="/auth/login"
            className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
          >
            Log In
          </a>
          <a
            href="/signup"
            className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Get Started
          </a>
        </div>
        {/* Mobile menu button - shows on small screens */}
        <div className="flex items-center gap-4 sm:hidden">
          <a
            href="/signup"
            className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Get Started
          </a>
        </div>
      </div>
    </nav>
  );
}
