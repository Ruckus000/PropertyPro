import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/footer';
import { getLegalDocs } from '@/lib/legal-content';

export const metadata: Metadata = {
  title: {
    template: '%s | PropertyPro Florida',
    default: 'Legal | PropertyPro Florida',
  },
  description: 'Legal documents for PropertyPro Florida',
};

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MarketingNav />
      <main id="main-content" className="mk-band">
        <div className="mk-wrap">
          <article className="mk-prose">{children}</article>
        </div>
      </main>
      <MarketingFooter legalDocs={getLegalDocs()} />
    </>
  );
}
