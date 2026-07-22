import { redirectToCanonicalHost } from '@/lib/tenant/redirect-canonical-host';

interface Props {
  params: Promise<{ subdomain: string }>;
}

export default async function RequestAccessPage({ params }: Props) {
  const { subdomain } = await params;
  redirectToCanonicalHost(subdomain, '/request-access');
}
