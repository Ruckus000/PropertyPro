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

export interface PollResultOption {
  option: string;
  votes: number;
  percentage: number;
}

export interface PollResults {
  poll: BoardPollListItem;
  totalVotes: number;
  options: PollResultOption[];
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

export interface ForumReply {
  id: number;
  threadId: number;
  body: string;
  authorUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ForumThreadDetail {
  thread: BoardForumThreadListItem;
  replies: ForumReply[];
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

export interface ElectionCandidate {
  id: number;
  label: string;
  description: string | null;
  userId: string | null;
  sortOrder: number;
}

export interface ElectionDetail {
  election: BoardElectionListItem & { eligibleUnitCount: number };
  candidates: ElectionCandidate[];
}

export interface ElectionCandidateResult {
  candidateId: number;
  label: string;
  voteCount: number;
}

export interface ElectionResults {
  candidateResults: ElectionCandidateResult[];
  abstentionCount: number;
  totalBallotsCast: number;
  eligibleUnitCount: number;
  quorumPercentage: number;
  quorumMet: boolean;
}

export interface ElectionProxy {
  id: number;
  electionId: number;
  grantorUserId: string;
  grantorUnitId: number;
  proxyHolderUserId: string;
  status: 'pending' | 'approved' | 'rejected' | 'revoked';
  approvedByUserId: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface PollMyVote {
  hasVoted: boolean;
  selectedOptions: string[];
}

export const BOARD_KEYS = {
  all: ['board'] as const,
  polls: {
    all: ['board', 'polls'] as const,
    list: (communityId: number, includeEnded: boolean) =>
      ['board', 'polls', 'list', communityId, includeEnded ? 'ended' : 'active'] as const,
    detail: (communityId: number, pollId: number) =>
      ['board', 'polls', 'detail', communityId, pollId] as const,
    results: (communityId: number, pollId: number) =>
      ['board', 'polls', 'results', communityId, pollId] as const,
    myVote: (communityId: number, pollId: number) =>
      ['board', 'polls', 'my-vote', communityId, pollId] as const,
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
    list: (communityId: number, limit: number) =>
      ['board', 'elections', 'list', communityId, limit] as const,
    detail: (communityId: number, electionId: number) =>
      ['board', 'elections', 'detail', communityId, electionId] as const,
    results: (communityId: number, electionId: number) =>
      ['board', 'elections', 'results', communityId, electionId] as const,
    proxies: (communityId: number, electionId: number) =>
      ['board', 'elections', 'proxies', communityId, electionId] as const,
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
  options?: { limit?: number },
) {
  const limit = Math.min(options?.limit ?? 25, 25);

  return useQuery({
    queryKey: BOARD_KEYS.elections.list(communityId, limit),
    queryFn: async () => {
      const params = new URLSearchParams({
        communityId: String(communityId),
        limit: String(limit),
      });

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

export function useBoardElectionDetail(communityId: number, electionId: number | null) {
  return useQuery({
    queryKey: electionId === null
      ? [...BOARD_KEYS.elections.all, 'detail', communityId, 'none'] as const
      : BOARD_KEYS.elections.detail(communityId, electionId),
    queryFn: async () =>
      requestJson<ElectionDetail>(`/api/v1/elections/${electionId}?communityId=${communityId}`),
    enabled: communityId > 0 && electionId !== null,
    staleTime: 30_000,
  });
}

export function useBoardElectionResults(communityId: number, electionId: number | null) {
  return useQuery({
    queryKey: electionId === null
      ? [...BOARD_KEYS.elections.all, 'results', communityId, 'none'] as const
      : BOARD_KEYS.elections.results(communityId, electionId),
    queryFn: async () =>
      requestJson<ElectionResults>(
        `/api/v1/elections/${electionId}/results?communityId=${communityId}`,
      ),
    enabled: communityId > 0 && electionId !== null,
    staleTime: 30_000,
  });
}

export function useBoardElectionProxies(communityId: number, electionId: number | null) {
  return useQuery({
    queryKey: electionId === null
      ? [...BOARD_KEYS.elections.all, 'proxies', communityId, 'none'] as const
      : BOARD_KEYS.elections.proxies(communityId, electionId),
    queryFn: async () =>
      requestJson<ElectionProxy[]>(
        `/api/v1/elections/${electionId}/proxies?communityId=${communityId}`,
      ),
    enabled: communityId > 0 && electionId !== null,
    staleTime: 30_000,
  });
}

export function useBoardPollResults(communityId: number, pollId: number | null) {
  return useQuery({
    queryKey: pollId === null
      ? [...BOARD_KEYS.polls.all, 'results', communityId, 'none'] as const
      : BOARD_KEYS.polls.results(communityId, pollId),
    queryFn: async () =>
      requestJson<PollResults>(`/api/v1/polls/${pollId}/results?communityId=${communityId}`),
    enabled: communityId > 0 && pollId !== null,
    staleTime: 60_000,
  });
}

export function useBoardPollMyVote(communityId: number, pollId: number | null) {
  return useQuery({
    queryKey: pollId === null
      ? [...BOARD_KEYS.polls.all, 'my-vote', communityId, 'none'] as const
      : BOARD_KEYS.polls.myVote(communityId, pollId),
    queryFn: async () =>
      requestJson<PollMyVote>(`/api/v1/polls/${pollId}/my-vote?communityId=${communityId}`),
    enabled: communityId > 0 && pollId !== null,
    staleTime: 60_000,
  });
}

export function useBoardForumThread(communityId: number, threadId: number | null) {
  return useQuery({
    queryKey: threadId === null
      ? [...BOARD_KEYS.forum.all, 'detail', communityId, 'none'] as const
      : BOARD_KEYS.forum.detail(communityId, threadId),
    queryFn: async () =>
      requestJson<ForumThreadDetail>(
        `/api/v1/forum/threads/${threadId}?communityId=${communityId}`,
      ),
    enabled: communityId > 0 && threadId !== null,
    staleTime: 30_000,
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
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.polls.list(communityId, false) });
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.polls.list(communityId, true) });
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.polls.results(communityId, pollId) });
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.polls.myVote(communityId, pollId) });
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

export function useOpenElection(communityId: number, electionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () =>
      requestJson<BoardElectionListItem>(`/api/v1/elections/${electionId}/open`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.elections.all });
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.elections.detail(communityId, electionId) });
    },
  });
}

export function useCloseElection(communityId: number, electionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () =>
      requestJson<BoardElectionListItem>(`/api/v1/elections/${electionId}/close`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.elections.all });
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.elections.detail(communityId, electionId) });
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.elections.results(communityId, electionId) });
    },
  });
}

export function useCertifyElection(communityId: number, electionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { resultsDocumentId?: number | null }) =>
      requestJson<BoardElectionListItem>(`/api/v1/elections/${electionId}/certify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...payload }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.elections.all });
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.elections.detail(communityId, electionId) });
    },
  });
}

export function useCancelElection(communityId: number, electionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { canceledReason: string }) =>
      requestJson<BoardElectionListItem>(`/api/v1/elections/${electionId}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...payload }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.elections.all });
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.elections.detail(communityId, electionId) });
    },
  });
}

export function useSnapshotEligibility(communityId: number, electionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () =>
      requestJson<{ eligibleUnitCount: number; insertedCount: number }>(`/api/v1/elections/${electionId}/eligibility`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.elections.detail(communityId, electionId) });
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.elections.all });
    },
  });
}

export function useCreateElectionProxy(communityId: number, electionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { proxyHolderUserId: string; grantorUnitId?: number | null }) =>
      requestJson<ElectionProxy>(`/api/v1/elections/${electionId}/proxies`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...payload }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.elections.proxies(communityId, electionId) });
    },
  });
}

export function useApproveElectionProxy(communityId: number, electionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (proxyId: number) =>
      requestJson<ElectionProxy>(`/api/v1/elections/${electionId}/proxies/${proxyId}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.elections.proxies(communityId, electionId) });
    },
  });
}

export function useRejectElectionProxy(communityId: number, electionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (proxyId: number) =>
      requestJson<ElectionProxy>(`/api/v1/elections/${electionId}/proxies/${proxyId}/reject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.elections.proxies(communityId, electionId) });
    },
  });
}

export function useRevokeElectionProxy(communityId: number, electionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (proxyId: number) =>
      requestJson<ElectionProxy>(`/api/v1/elections/${electionId}/proxies/${proxyId}/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.elections.proxies(communityId, electionId) });
    },
  });
}

export function useCreatePoll(communityId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      title: string;
      description?: string | null;
      pollType: 'single_choice' | 'multiple_choice';
      options: string[];
      endsAt?: string | null;
    }) =>
      requestJson<BoardPollListItem>('/api/v1/polls', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...payload }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.polls.list(communityId, false) });
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.polls.list(communityId, true) });
    },
  });
}

export function useCreateForumReply(communityId: number, threadId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { body: string }) =>
      requestJson<ForumReply>(`/api/v1/forum/threads/${threadId}/reply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...payload }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.forum.detail(communityId, threadId) });
    },
  });
}

export function useUpdateForumThread(communityId: number, threadId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      title?: string;
      body?: string;
      isPinned?: boolean;
      isLocked?: boolean;
    }) =>
      requestJson<BoardForumThreadListItem>(`/api/v1/forum/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...payload }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.forum.all });
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.forum.detail(communityId, threadId) });
    },
  });
}

export function useCastElectionVote(communityId: number, electionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { selectedCandidateIds?: number[]; isAbstention?: boolean }) =>
      requestJson<{ submissionId: number; submissionFingerprint: string | null }>(`/api/v1/elections/${electionId}/vote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...payload }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.elections.all });
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.elections.detail(communityId, electionId) });
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.elections.results(communityId, electionId) });
      await queryClient.invalidateQueries({ queryKey: BOARD_KEYS.elections.myVote(communityId, electionId) });
    },
  });
}
