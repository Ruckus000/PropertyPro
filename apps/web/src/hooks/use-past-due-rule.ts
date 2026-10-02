import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

export interface PastDueRuleValue {
  minCents: number;
  minDays: number;
}

const key = (communityId: number) => ['past-due-rule', communityId] as const;

export function usePastDueRule(communityId: number, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: key(communityId),
    enabled: communityId > 0 && options?.enabled !== false,
    queryFn: () => requestJson<PastDueRuleValue>(`/api/v1/payments/past-due-rule?communityId=${communityId}`),
  });
}

export function useUpdatePastDueRule(communityId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rule: PastDueRuleValue) =>
      requestJson<PastDueRuleValue>('/api/v1/payments/past-due-rule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, ...rule }),
      }),
    onSuccess: (rule) => qc.setQueryData(key(communityId), rule),
  });
}
