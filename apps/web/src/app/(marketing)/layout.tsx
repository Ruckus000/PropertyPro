import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PropertyPro Florida — Florida Condo & HOA Compliance Platform',
  description:
    'Meet Florida Statute §718 and §720 website requirements before the January 2026 deadline. Document management, meeting notices, owner portal, and compliance dashboard for condominium and HOA associations.',
  keywords: [
    'Florida condo compliance',
    'Florida HOA website requirement',
    'Florida Statute 718',
    'Florida Statute 720',
    'condo association website',
    'HOA compliance software',
    'Florida condominium management',
    'owner portal',
    'meeting notices',
    'document management',
  ],
  openGraph: {
    title: 'PropertyPro Florida — Florida Condo & HOA Compliance Platform',
    description:
      'Meet Florida Statute §718 and §720 website requirements. Document management, meeting notices, owner portal, and compliance dashboard.',
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
  return <>{children}</>;
}
