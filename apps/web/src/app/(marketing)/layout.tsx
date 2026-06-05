import type { Metadata } from 'next';
import { Fraunces } from 'next/font/google';
import './marketing-theme.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-fraunces',
});

export const metadata: Metadata = {
  title: 'PropertyPro Florida — Florida Condo & HOA Compliance for Property Managers',
  description:
    'Run a whole portfolio of Florida condo & HOA associations compliant by default. Meet §718 and §720 website requirements before the January 2026 deadline — document management, meeting notices, owner portals, and one centralized compliance view.',
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
