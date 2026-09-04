"use client";

import { useQuery } from "@tanstack/react-query";
import type { ChecklistItemData } from "@/components/compliance/compliance-checklist-item";

export const COMPLIANCE_QUERY_KEY = "compliance-checklist";

async function fetchChecklist(communityId: number): Promise<ChecklistItemData[]> {
  const res = await fetch(`/api/v1/compliance?communityId=${communityId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch compliance checklist: ${res.status}`);
  }
  const json = await res.json();
  return json.data as ChecklistItemData[];
}

/**
 * `enabled` is not a convenience. `GET /api/v1/compliance` requires
 * `compliance:read` — which a TENANT does not have — and throws Forbidden for a
 * community without `hasCompliance` (every apartment). A caller that cannot
 * satisfy both gates must not fire the request at all, or the 403 surfaces as a
 * broken screen.
 */
export function useComplianceChecklist(communityId: number, options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  return useQuery({
    queryKey: [COMPLIANCE_QUERY_KEY, communityId],
    queryFn: () => fetchChecklist(communityId),
    enabled: enabled && communityId > 0,
  });
}
