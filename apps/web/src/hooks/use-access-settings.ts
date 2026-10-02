import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

export interface AccessSettingsValue {
  tenantsCanViewInspectionReports: boolean;
}

const key = (communityId: number) => ['access-settings', communityId] as const;

export function useAccessSettings(communityId: number) {
  return useQuery({
    queryKey: key(communityId),
    enabled: communityId > 0,
    queryFn: () => requestJson<AccessSettingsValue>(`/api/v1/settings/access?communityId=${communityId}`),
  });
}

export function useUpdateAccessSettings(communityId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (value: AccessSettingsValue) =>
      requestJson<AccessSettingsValue>('/api/v1/settings/access', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, ...value }),
      }),
    onSuccess: (value) => qc.setQueryData(key(communityId), value),
  });
}
