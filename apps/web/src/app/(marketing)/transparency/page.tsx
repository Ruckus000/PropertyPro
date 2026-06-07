import type { Metadata } from 'next';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/footer';
import { getLegalDocs } from '@/lib/legal-content';

export const metadata: Metadata = {
  title: 'Community Transparency | PropertyPro Florida',
  description:
    'Find your Florida condominium or HOA community transparency page — financials, documents, meeting minutes, and compliance status in one place.',
};

export default function TransparencyPage() {
  return (
    <>
      <MarketingNav />
      <main id="main-content">
        <section className="mk-band mk-band-alt">
          <div className="mk-wrap">
            <div className="mk-sec-head" style={{ maxWidth: '42em' }}>
              <span className="mk-eyebrow">Transparency</span>
              <h1 className="mk-display" style={{ fontSize: 52, margin: '12px 0 18px' }}>
                Community Transparency Pages
              </h1>
              <p className="mk-muted" style={{ fontSize: 19 }}>
                Every community on PropertyPro gets a public transparency page — a
                single destination for financials, meeting minutes, posted
                documents, and compliance status required under Florida
                §718.111(12)(g) and §720.303.
              </p>
              <p className="mk-muted" style={{ fontSize: 17, marginTop: 14 }}>
                Residents and prospective buyers can view this information without
                logging in. Boards control what is shared and when documents are
                published.
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gap: 24,
                marginTop: 40,
                maxWidth: '42em',
              }}
            >
              <div className="mk-card" style={{ padding: 28 }}>
                <h2
                  className="mk-display"
                  style={{ fontSize: 22, fontWeight: 600 }}
                >
                  Find your community
                </h2>
                <p className="mk-muted" style={{ marginTop: 10, fontSize: 15 }}>
                  Replace{' '}
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    your-community
                  </span>{' '}
                  with your association&apos;s PropertyPro subdomain:
                </p>
                <pre
                  style={{
                    marginTop: 16,
                    padding: '14px 16px',
                    borderRadius: 12,
                    background: 'var(--mk-cream-2)',
                    border: '1px solid var(--mk-line)',
                    fontFamily: 'monospace',
                    fontSize: 14.5,
                    color: 'var(--mk-ink)',
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}
                >
                  [your-community].getpropertypro.com/transparency
                </pre>
              </div>

              <div className="mk-card" style={{ padding: 28 }}>
                <h2
                  className="mk-display"
                  style={{ fontSize: 22, fontWeight: 600 }}
                >
                  See a live example
                </h2>
                <p className="mk-muted" style={{ marginTop: 10, fontSize: 15 }}>
                  The Sunset Condos demo shows what a fully populated transparency
                  page looks like:
                </p>
                <a
                  href="https://sunset-condos.getpropertypro.com/transparency"
                  className="mk-pill mk-pill-ghost"
                  style={{ marginTop: 16 }}
                >
                  sunset-condos.getpropertypro.com/transparency
                  <span aria-hidden="true">→</span>
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter legalDocs={getLegalDocs()} />
    </>
  );
}
