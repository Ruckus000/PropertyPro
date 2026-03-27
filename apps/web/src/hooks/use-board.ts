'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

export interface BoardPollListItem {
  id: number;
  title: string;
  description: string | null;
  pollType: 'single_choice' | 'multiple_choice';
  options: string[];
  endsAt: string | null;
  isActive: boolean;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BoardForumThreadListItem {
  id: number;
  title: string;
  body: string;
  authorUserId: string;
  isPinned: boolean;
  isLocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BoardElectionListItem {
  id: number;
  title: string;
  description: string | null;
  electionType: string;
  status: string;
  opensAt: string;
  closesAt: string;
  isSecretBallot: boolean;
  maxSelections: number;
  quorumPercentage: number;
  totalBallotsCast: number;
  resultsDocumentId: number | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface BoardElectionReceipt {
  hasVoted: boolean;
  submittedAt: string | null;
  submissionFingerprint: string | null;
  viaProxy: boolean;
  electionStatus: string;
}

export const BOARD_KEYS = {
  all: ['board'] as const,
  polls: {
    all: ['board', 'polls'] as const,
    list: (communityId: number, includeEnded: boolean) =>
      ['board', 'polls', 'list', communityId, includeEnded ? 'ended' : 'active'] as const,
    detail: (communityId: number, pollId: number) =>
      ['board', 'polls', 'detail', communityId, pollId] as const,
  },
  forum: {
    all: ['board', 'forum'] as const,
    list: (communityId: number, limit: number, offset: number) =>
      ['board', 'forum', 'list', communityId, limit, offset] as const,
    detail: (communityId: number, threadId: number) =>
      ['board', 'forum', 'detail', communityId, threadId] as const,
  },
  elections: {
    all: ['board', 'elections'] as const,
    list: (communityId: number, limit: number, cursor?: string | null) =>
      ['board', 'elections', 'list', communityId, limit, cursor ?? 'start'] as const,
    detail: (communityId: number, electionId: number) =>
      ['board', 'elections', 'detail', communityId, electionId] as const,
    myVote: (communityId: number, electionId: number) =>
      ['board', 'elections', 'my-vote', communityId, electionId] as const,
  },
};

export function useBoardPolls(
  communityId: number,
  options?: { includeEnded?: boolean },
) {
  const includeEnded = options?.includeEnded ?? false;

  return useQuery({
    queryKey: BOARD_KEYS.polls.list(communityId, includeEnded),
    queryFn: async () =>
      requestJson<BoardPollListItem[]>(
        `/api/v1/polls?communityId=${communityId}&includeEnded=${includeEnded ? 'true' : 'false'}`,
      ),
    enabled: communityId > 0,
    staleTime: 60_000,
  });
}

export function useBoardForumThreads(
  communityId: number,
  options?: { limit?: number; offset?: number },
) {
  const limit = Math.min(options?.limit ?? 50, 50);
  const offset = Math.max(options?.offset ?? 0, 0);

  return useQuery({
    queryKey: BOARD_KEYS.forum.list(communityId, limit, offset),
    queryFn: async () =>
      requestJson<BoardForumThreadListItem[]>(
        `/api/v1/forum/threads?communityId=${communityId}&limit=${limit}&offset=${offset}`,
      ),
    enabled: communityId > 0,
    staleTime: 30_000,
  });
}

export function useBoardElections(
  communityId: number,
  options?: { cursor?: string | null; limit?: number },
) {
  const limit = Math.min(options?.limit ?? 25, 25);
  const cursor = options?.cursor ?? null;

  return useQuery({
    queryKey: BOARD_KEYS.elections.list(communityId, limit, cursor),
    queryFn: async () => {
      const params = new URLSearchParams({
        communityId: String(communityId),
        limit: String(limit),
      });
      if (cursor) {
        params.set('cursor', cursor);
      }

      return requestJson<BoardElectionListItem[]>(
        `/api/v1/elections?${params.toString()}`,
      );
    },
    enabled: communityId > 0,
    staleTime: 30_000,
  });
}

export function useBoardElectionReceipt(communityId: number, electionId: number | null) {
  return useQuery({
    queryKey: electionId === null
      ? [...BOARD_KEYS.elections.all, 'my-vote', communityId, 'none'] as const
      : BOARD_KEYS.elections.myVote(communityId, electionId),
    queryFn: async () =>
      requestJson<BoardElectionReceipt>(
        `/api/v1/elections/${electionId}/my-vote?communityId=${communityId}`,
      ),
    enabled: communityId > 0 && electionId !== null,
    staleTime: 15_000,
  });
}

export function useCastPollVote(communityId: number, pollId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (selectedOptions: string[]) =>
      requestJson<{ id: number }>(`/api/v1/polls/${pollId}/vote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, selectedOptions }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.polls.detail(communityId, pollId) });
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.polls.all });
    },
  });
}

export function useCreateForumThread(communityId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { title: string; body: string }) =>
      requestJson<BoardForumThreadListItem>('/api/v1/forum/threads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...payload }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.forum.all });
    },
  });
}

export function useCastElectionVote(communityId: number, electionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { selectedCandidateIds?: number[]; isAbstention?: boolean }) =>
      requestJson<{ id: number }>(`/api/v1/elections/${electionId}/vote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...payload }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.elections.detail(communityId, electionId) });
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.elections.all });
    },
  });
}
