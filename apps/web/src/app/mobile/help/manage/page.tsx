export const dynamic = 'force-dynamic';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

interface MobileHelpManageRedirectPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getSearchParamValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export default async function MobileFaqManagePage({
  searchParams,
}: MobileHelpManageRedirectPageProps) {
  const [requestHeaders, resolvedSearchParams] = await Promise.all([headers(), searchParams]);
  const communityId =
    getSearchParamValue(resolvedSearchParams.communityId) ??
    requestHeaders.get('x-community-id');

  redirect(communityId ? `/help/manage?communityId=${communityId}` : '/help/manage');
}
