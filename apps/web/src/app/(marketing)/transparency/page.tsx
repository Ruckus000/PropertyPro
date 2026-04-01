import type { Metadata } from 'next';
import { MarketingFooter } from '@/components/marketing/footer';

export const metadata: Metadata = {
  title: 'Community Transparency | PropertyPro Florida',
  description:
    'Find your Florida condominium or HOA community transparency page — financials, documents, meeting minutes, and compliance status in one place.',
};

export default function TransparencyPage() {
  return (
    <div className="min-h-screen bg-surface-card">
      <MarketingNav />
      <main id="main-content">
        <section className="mx-auto max-w-3xl px-6 py-20">
          <h1 className="text-3xl font-bold tracking-tight text-content">
            Community Transparency Pages
          </h1>
          <p className="mt-4 text-lg text-content-secondary">
            Every community on PropertyPro gets a public transparency page — a
            single destination for financials, meeting minutes, posted documents,
            and compliance status required under Florida §718.111(12)(g) and
            §720.303.
          </p>
          <p className="mt-3 text-base text-content-secondary">
            Residents and prospective buyers can view this information without
            logging in. Boards control what is shared and when documents are
            published.
          </p>

          <div className="mt-10 rounded-[var(--radius-md)] border border-edge bg-surface-raised p-6">
            <h2 className="text-base font-semibold text-content">
              Find your community
            </h2>
            <p className="mt-2 text-sm text-content-secondary">
              Replace{' '}
              <span className="font-mono text-content">your-community</span>{' '}
              with your association&apos;s PropertyPro subdomain:
            </p>
            <p className="mt-3 rounded-[var(--radius-sm)] bg-surface-muted px-4 py-3 font-mono text-sm text-content">
              [your-community].getpropertypro.com/transparency
            </p>
          </div>

          <div className="mt-8">
            <h2 className="text-base font-semibold text-content">
              See a live example
            </h2>
            <p className="mt-2 text-sm text-content-secondary">
              The Sunset Condos demo shows what a fully populated transparency
              page looks like:
            </p>
            <a
              href="https://sunset-condos.getpropertypro.com/transparency"
              className="mt-3 inline-flex items-center text-sm font-medium text-content-link transition-colors hover:underline"
            >
              sunset-condos.getpropertypro.com/transparency
            </a>
          </div>
        </section>
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
          <a href="/#features" className="text-sm font-medium text-content-secondary transition-colors hover:text-content">Features</a>
          <a href="/#compliance" className="text-sm font-medium text-content-secondary transition-colors hover:text-content">Compliance</a>
          <a href="/#pricing" className="text-sm font-medium text-content-secondary transition-colors hover:text-content">Pricing</a>
          <a href="/auth/login" className="text-sm font-medium text-content-secondary transition-colors hover:text-content">Log In</a>
          <a href="/signup" className="inline-flex items-center rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse transition-colors hover:bg-interactive-hover">Get Started</a>
        </div>
        <div className="flex items-center gap-4 sm:hidden">
          <a href="/signup" className="inline-flex items-center rounded-md bg-interactive px-3 py-2 text-sm font-medium text-content-inverse transition-colors hover:bg-interactive-hover">Get Started</a>
        </div>
      </div>
    </nav>
  );
}
