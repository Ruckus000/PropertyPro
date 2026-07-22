import { redirectToCanonicalHost } from '@/lib/tenant/redirect-canonical-host';

interface PublicCommunityPageProps {
  params: Promise<{ subdomain: string }>;
}

/**
 * Path-based public routes are deprecated — canonical traffic uses the
 * community host (`{slug}.getpropertypro.com/`).
 */
export default async function PublicCommunityPage({
  params,
}: PublicCommunityPageProps) {
  const { subdomain } = await params;
  redirectToCanonicalHost(subdomain, '/');
}
