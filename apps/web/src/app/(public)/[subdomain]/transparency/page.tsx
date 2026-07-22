import { redirectToCanonicalHost } from '@/lib/tenant/redirect-canonical-host';

interface Props {
  params: Promise<{ subdomain: string }>;
}

export default async function PublicTransparencyPathPage({ params }: Props) {
  const { subdomain } = await params;
  redirectToCanonicalHost(subdomain, '/transparency');
}
