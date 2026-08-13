import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './marketing-theme.css';

// Vendored rather than fetched from Google at build time — see the note in
// `app/layout.tsx` and `app/fonts/README.md` (#962). This layout needs the
// italic face too, which the app shell does not: the 70px hero swash
// (`marketing-theme.css:67`) and blockquotes (`:226`) are italic.
//
// Shares the CSS family name `fraunces` with the loader in `app/layout.tsx` —
// `next/font/local` derives it from the file name. See the note there before
// changing either one.
const fraunces = localFont({
  src: [
    { path: '../fonts/fraunces-latin-var.woff2', weight: '100 900', style: 'normal' },
    { path: '../fonts/fraunces-latin-var-italic.woff2', weight: '100 900', style: 'italic' },
  ],
  display: 'swap',
  variable: '--font-fraunces',
  adjustFontFallback: 'Times New Roman',
});

export const metadata: Metadata = {
  title: 'PropertyPro Florida — Condo & HOA Compliance Software',
  description:
    'Run a portfolio of Florida condo & HOA associations compliant by default — document posting, meeting notices, owner portals, and one compliance view.',
  keywords: [
    'Florida property management software',
    'Florida condo compliance',
    'Florida HOA website requirement',
    'Florida Statute 718',
    'Florida Statute 720',
    'CAM software Florida',
    'association management portfolio',
    'owner portal',
    'meeting notices',
    'document management',
  ],
  openGraph: {
    title: 'PropertyPro Florida — Compliance for Florida property managers',
    description:
      'Run a whole portfolio of Florida associations compliant by default. §718 & §720 document posting, notices, owner portals, and centralized compliance.',
    type: 'website',
    locale: 'en_US',
    siteName: 'PropertyPro Florida',
  },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${fraunces.variable} marketing-theme`}>{children}</div>
  );
}
