import type { Metadata } from 'next';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/footer';
import { PortfolioInquiryForm } from '@/components/marketing/portfolio-inquiry-form';
import { getLegalDocs } from '@/lib/legal-content';

export const metadata: Metadata = {
  title: 'Talk to us about your portfolio | PropertyPro Florida',
  description:
    'Managing multiple Florida associations? Tell us about your portfolio and we’ll get back to you within one business day.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <>
      <MarketingNav />
      <main id="main-content" className="mk-band">
        <div className="mk-wrap">
          <div className="mk-sec-head">
            <span className="mk-eyebrow">Property managers</span>
            <h1 className="mk-display">Talk to us about your portfolio.</h1>
            <p className="mk-muted">
              Volume pricing, bulk operations across associations, white-label
              branding, and one compliance view over the whole book. Tell us what
              you run and we’ll come back with specifics.
            </p>
          </div>

          <PortfolioInquiryForm />

          {/*
            Off-ramp for the traffic this page will attract but cannot serve. A
            generically-named /contact reached from three CTAs pulls in resident
            and board support requests, and a lead table full of those is the
            noise that makes it useless to work by hand.
          */}
          <div className="mk-note" style={{ maxWidth: '34em' }}>
            <strong>Not a property manager?</strong>
            <div>
              If you live in a community that uses PropertyPro, your association
              board is the right first stop. For anything else, email{' '}
              <a href="mailto:support@getpropertypro.com">
                support@getpropertypro.com
              </a>
              . Running a single association?{' '}
              <a href="/#pricing">Self-serve plans start at $199/mo.</a>
            </div>
          </div>
        </div>
      </main>
      <MarketingFooter legalDocs={getLegalDocs()} />
    </>
  );
}
