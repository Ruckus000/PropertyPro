'use client';

import { useQuery } from '@tanstack/react-query';

export interface UserCommunity {
  id: number;
  name: string;
  slug: string;
  role: string;
  displayTitle: string | null;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
}

export function useUserCommunities() {
  return useQuery<{ data: UserCommunity[] }>({
    queryKey: ['user-communities'],
    queryFn: async () => {
      const res = await fetch('/api/v1/me/communities');
      if (!res.ok) throw new Error('Failed to load communities');
      return res.json();
    },
    staleTime: 60_000,
  });
}
