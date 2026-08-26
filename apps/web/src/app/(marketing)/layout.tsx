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
  title: 'PropertyPro — Florida condo & HOA records, kept to statute',
  description:
    'The Florida website requirement took effect January 1, 2026. PropertyPro turns §718 and §720 recordkeeping into a tracked list with dates, evidence, and an audit trail.',
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
    title: 'PropertyPro — Florida condo & HOA records, kept to statute',
    description:
      'The Florida website requirement took effect January 1, 2026. PropertyPro turns §718 and §720 recordkeeping into a tracked list with dates, evidence, and an audit trail.',
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
