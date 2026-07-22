/**
 * Community unavailable page — P2-34a
 *
 * Shown when a community's subscription has expired (status = 'expired').
 * Uses the subdomain from the URL to look up basic branding.
 * Public read access: residents and owners can still see this page.
 */
import type { Metadata } from 'next';
import { redirectToCanonicalHost } from '@/lib/tenant/redirect-canonical-host';

export const metadata: Metadata = {
  title: 'Service Unavailable',
  robots: { index: false },
};

interface CommunityUnavailablePageProps {
  params: Promise<{ subdomain: string }>;
}

export default async function CommunityUnavailablePage({
  params,
}: CommunityUnavailablePageProps) {
  const { subdomain } = await params;
  redirectToCanonicalHost(subdomain, '/unavailable');
}
