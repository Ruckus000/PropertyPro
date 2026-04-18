export const dynamic = 'force-dynamic';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

interface MobileHelpRedirectPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getSearchParamValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export default async function MobileHelpPage({
  searchParams,
}: MobileHelpRedirectPageProps) {
  const [requestHeaders, resolvedSearchParams] = await Promise.all([headers(), searchParams]);
  const communityId =
    getSearchParamValue(resolvedSearchParams.communityId) ??
    requestHeaders.get('x-community-id');

  redirect(communityId ? `/help?communityId=${communityId}` : '/help');
}
