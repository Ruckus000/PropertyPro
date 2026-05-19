'use client';

import { useQuery } from '@tanstack/react-query';
import type { ChecklistItemData } from '@/components/compliance/compliance-checklist-item';

/**
 * Stable query key for the compliance checklist of a single community.
 */
export const COMPLIANCE_CHECKLIST_QUERY_KEY = (communityId: number) =>
  ['compliance-checklist', communityId] as const;

/**
 * Loads the statutory compliance checklist for a community.
 *
 * Performs the exact two-step sequence the onboarding step previously ran
 * inline: POST `/api/v1/compliance` to ensure the checklist items are
 * generated, then (only on POST success) GET `/api/v1/compliance` to fetch
 * them. The short-circuit is preserved — a non-OK POST throws immediately and
 * the GET never runs.
 *
 * Documented exception to the requestJson rule: this hook keeps raw `fetch`
 * because (1) the POST error path is status-branched — a 403 yields a
 * condo/HOA-only literal distinct from the generic init failure — and (2) it
 * sequences POST→GET against two flat (non-paginated) endpoints, neither of
 * which matches the `requestJson` envelope contract.
 */
async function fetchComplianceChecklist(
  communityId: number,
  signal: AbortSignal,
): Promise<ChecklistItemData[]> {
  // 1. Ensure checklist items are generated.
  const postRes = await fetch('/api/v1/compliance', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ communityId }),
    signal,
  });
  if (!postRes.ok) {
    const errorJson = (await postRes.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    const serverMessage = errorJson?.error?.message;

    if (postRes.status === 403) {
      throw new Error(
        serverMessage ?? 'Compliance checklist is only available for condo/HOA communities.',
      );
    }
    throw new Error(serverMessage ?? 'Failed to initialize compliance checklist');
  }

  // 2. Fetch checklist items.
  const params = new URLSearchParams({ communityId: String(communityId) });
  const getRes = await fetch(`/api/v1/compliance?${params.toString()}`, { signal });
  if (!getRes.ok) {
    throw new Error('Failed to load compliance checklist');
  }
  const json = (await getRes.json()) as { data: ChecklistItemData[] };
  return json.data ?? [];
}

export function useComplianceChecklist(communityId: number) {
  return useQuery({
    queryKey: COMPLIANCE_CHECKLIST_QUERY_KEY(communityId),
    queryFn: ({ signal }) => fetchComplianceChecklist(communityId, signal),
    enabled: Number.isFinite(communityId) && communityId > 0,
  });
}
