import { redirectToCanonicalHost } from '@/lib/tenant/redirect-canonical-host';

interface PublicNoticesPageProps {
  params: Promise<{ subdomain: string }>;
}

export default async function PublicNoticesPage({ params }: PublicNoticesPageProps) {
  const { subdomain } = await params;
  redirectToCanonicalHost(subdomain, '/notices');
}
