import { useQuery } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

export const ADMIN_ROLES_PARAM =
  'board_member,board_president,cam,site_manager,property_manager_admin';

export interface ResidentRow {
  userId: string;
  fullName: string;
  role: string;
}

export function useResidents(communityId: number, roles: string) {
  return useQuery<ResidentRow[]>({
    queryKey: ['residents', communityId, roles],
    enabled: communityId > 0,
    queryFn: async ({ signal }) => {
      const data = await requestJson<Record<string, unknown>[]>(
        `/api/v1/residents?communityId=${communityId}&roles=${roles}`,
        { signal },
      );
      return data.map((r) => ({
        userId: r['userId'] as string,
        fullName: r['fullName'] as string,
        role: r['role'] as string,
      }));
    },
  });
}
