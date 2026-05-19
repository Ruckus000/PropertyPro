'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

export interface BillingGroupResponse {
  data: { billingGroupId: number };
}

// Documented exception to the requestJson rule: the route's error message is
// rendered verbatim in a warning AlertBanner and the generic fallback literal
// ('Failed to fetch billing group') differs from requestJson's ('Request
// failed'); the cached query-data shape ({ data: { billingGroupId } }) must
// also stay identical to the pre-drain consumer access path.
async function fetchBillingGroup(): Promise<BillingGroupResponse> {
  const res = await fetch('/api/v1/billing-groups/mine');
  if (!res.ok) {
    let message = 'Failed to fetch billing group';
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) {
        message = body.error.message;
      }
    } catch {
      // Ignore parse failures and use the generic fallback above.
    }
    throw new Error(message);
  }

  return res.json();
}

export function useBillingGroup(): UseQueryResult<BillingGroupResponse, Error> {
  return useQuery<BillingGroupResponse, Error>({
    queryKey: ['billing-group', 'mine'],
    queryFn: fetchBillingGroup,
  });
}
