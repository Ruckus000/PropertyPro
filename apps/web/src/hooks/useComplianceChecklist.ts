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

export function useComplianceChecklist(communityId: number) {
  return useQuery({
    queryKey: [COMPLIANCE_QUERY_KEY, communityId],
    queryFn: () => fetchChecklist(communityId),
    enabled: communityId > 0,
  });
}
