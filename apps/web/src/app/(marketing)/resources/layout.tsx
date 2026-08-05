import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/footer';
import { getLegalDocs } from '@/lib/legal-content';

export const metadata: Metadata = {
  title: {
    template: '%s | PropertyPro Florida',
    default: 'Resources | PropertyPro Florida',
  },
  description:
    'Plain-English guides to Florida condominium and HOA website compliance — what the statutes require, and by when.',
};

/**
 * Shell for the public resources corpus.
 *
 * Modelled on `legal/layout.tsx`, minus its `<article className="mk-prose">`
 * wrapper: the index is a card grid, so prose styling belongs on the article
 * page rather than around every child.
 */
export default function ResourcesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MarketingNav />
      <main id="main-content" className="mk-band">
        <div className="mk-wrap">{children}</div>
      </main>
      <MarketingFooter legalDocs={getLegalDocs()} />
    </>
  );
}
