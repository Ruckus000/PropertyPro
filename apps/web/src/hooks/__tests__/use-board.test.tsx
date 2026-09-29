/**
 * Characterization tests for `use-board.ts` (TST-04 / roadmap 3.T4).
 *
 * The forum-list walker already has `use-board-forum.test.tsx`; this file pins
 * everything else in the module — the 9 other queries and all 16 mutations.
 * (The audit's "17 mutations" counted the `useMutation` import line.)
 *
 * The contract a frontend refactor breaks first is cache coherence: which
 * cached views a mutation marks stale. Rather than spying on
 * `invalidateQueries` call arguments (which would couple the test to how the
 * hook spells an invalidation), every mutation test seeds a fixed "universe" of
 * board keys, runs the mutation for real against a stubbed `fetch`, and asserts
 * the EXACT set of keys that end up `isInvalidated`. That pins both halves:
 * a view that should go stale does, and one that should not stays fresh.
 *
 * Network is mocked at the edge (`fetch`), so `requestJson`'s envelope
 * unwrapping and `walkPaginated`'s page walk run for real.
 */
import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import {
  BOARD_KEYS,
  useApproveElectionProxy,
  useBoardElectionDetail,
  useBoardElectionProxies,
  useBoardElectionReceipt,
  useBoardElectionResults,
  useBoardElections,
  useBoardForumThread,
  useBoardPollMyVote,
  useBoardPollResults,
  useBoardPolls,
  useCancelElection,
  useCastElectionVote,
  useCastPollVote,
  useCertifyElection,
  useCloseElection,
  useCreateElectionProxy,
  useCreateForumReply,
  useCreateForumThread,
  useCreatePoll,
  useDeleteForumReply,
  useOpenElection,
  useRejectElectionProxy,
  useRevokeElectionProxy,
  useSnapshotEligibility,
  useUpdateForumThread,
} from '../use-board';
import * as boardModule from '../use-board';

/** The module's read hooks; every other exported `use*` is a mutation. */
const QUERY_HOOKS = [
  'useBoardPolls',
  'useBoardForumThreads',
  'useBoardElections',
  'useBoardElectionReceipt',
  'useBoardElectionDetail',
  'useBoardElectionResults',
  'useBoardElectionProxies',
  'useBoardPollResults',
  'useBoardPollMyVote',
  'useBoardForumThread',
];

const CID = 7;
const OTHER_CID = 8;
const POLL = 5;
const THREAD = 3;
const ELECTION = 11;

function ok(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function page(items: unknown[]): Response {
  return ok({ data: items, pagination: { nextCursor: null, hasMore: false, pageSize: 100 } });
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrap(qc: QueryClient) {
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

/** Every board key a mutation could plausibly touch, plus cross-entity and cross-community controls. */
const UNIVERSE: Record<string, QueryKey> = {
  'polls.list.active': BOARD_KEYS.polls.list(CID, false),
  'polls.list.ended': BOARD_KEYS.polls.list(CID, true),
  'polls.detail': BOARD_KEYS.polls.detail(CID, POLL),
  'polls.results': BOARD_KEYS.polls.results(CID, POLL),
  'polls.myVote': BOARD_KEYS.polls.myVote(CID, POLL),
  'polls.results.otherPoll': BOARD_KEYS.polls.results(CID, POLL + 1),
  'polls.list.otherCommunity': BOARD_KEYS.polls.list(OTHER_CID, false),
  'forum.list': BOARD_KEYS.forum.list(CID, 50, 0),
  'forum.detail': BOARD_KEYS.forum.detail(CID, THREAD),
  'forum.detail.otherThread': BOARD_KEYS.forum.detail(CID, THREAD + 1),
  'forum.detail.otherCommunity': BOARD_KEYS.forum.detail(OTHER_CID, THREAD),
  'elections.list': BOARD_KEYS.elections.list(CID, 25),
  'elections.detail': BOARD_KEYS.elections.detail(CID, ELECTION),
  'elections.results': BOARD_KEYS.elections.results(CID, ELECTION),
  'elections.proxies': BOARD_KEYS.elections.proxies(CID, ELECTION),
  'elections.myVote': BOARD_KEYS.elections.myVote(CID, ELECTION),
  'elections.proxies.otherElection': BOARD_KEYS.elections.proxies(CID, ELECTION + 1),
  'elections.proxies.otherCommunity': BOARD_KEYS.elections.proxies(OTHER_CID, ELECTION),
};

const ALL_FORUM = Object.keys(UNIVERSE).filter((k) => k.startsWith('forum.'));
const ALL_ELECTIONS = Object.keys(UNIVERSE).filter((k) => k.startsWith('elections.'));

function seedUniverse(qc: QueryClient) {
  for (const key of Object.values(UNIVERSE)) qc.setQueryData(key, { seeded: true });
}

function invalidatedNames(qc: QueryClient): string[] {
  return Object.entries(UNIVERSE)
    .filter(([, key]) => qc.getQueryState(key)?.isInvalidated === true)
    .map(([name]) => name)
    .sort();
}

function lastRequest() {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error('fetch was not called');
  const [url, init] = call as [string, RequestInit | undefined];
  return {
    url,
    method: init?.method ?? 'GET',
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Mutations — request shape + exact invalidation set
// ---------------------------------------------------------------------------

interface MutationCase {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useHook: () => { mutateAsync: (vars: any) => Promise<unknown> };
  vars: unknown;
  url: string;
  method: string;
  body: Record<string, unknown>;
  invalidates: string[];
}

const MUTATIONS: MutationCase[] = [
  {
    name: 'useCastPollVote',
    useHook: () => useCastPollVote(CID, POLL),
    vars: ['Yes'],
    url: `/api/v1/polls/${POLL}/vote`,
    method: 'POST',
    body: { communityId: CID, selectedOptions: ['Yes'] },
    // Both list slices (active + ended), plus this poll's detail/results/my-vote —
    // but not another poll's results and not another community's list.
    invalidates: ['polls.detail', 'polls.list.active', 'polls.list.ended', 'polls.myVote', 'polls.results'],
  },
  {
    name: 'useCreatePoll',
    useHook: () => useCreatePoll(CID),
    vars: { title: 'Paint', pollType: 'single_choice', options: ['A', 'B'] },
    url: '/api/v1/polls',
    method: 'POST',
    body: { communityId: CID, title: 'Paint', pollType: 'single_choice', options: ['A', 'B'] },
    invalidates: ['polls.list.active', 'polls.list.ended'],
  },
  {
    name: 'useCreateForumThread',
    useHook: () => useCreateForumThread(CID),
    vars: { title: 'T', body: 'B' },
    url: '/api/v1/forum/threads',
    method: 'POST',
    body: { communityId: CID, title: 'T', body: 'B' },
    // `forum.all` is a bare prefix: it reaches every community's forum cache.
    invalidates: ALL_FORUM,
  },
  {
    name: 'useUpdateForumThread',
    useHook: () => useUpdateForumThread(CID, THREAD),
    vars: { isPinned: true },
    url: `/api/v1/forum/threads/${THREAD}`,
    method: 'PATCH',
    body: { communityId: CID, isPinned: true },
    invalidates: ALL_FORUM,
  },
  {
    name: 'useCreateForumReply',
    useHook: () => useCreateForumReply(CID, THREAD),
    vars: { body: 'reply' },
    url: `/api/v1/forum/threads/${THREAD}/reply`,
    method: 'POST',
    body: { communityId: CID, body: 'reply' },
    invalidates: ['forum.detail'],
  },
  {
    name: 'useDeleteForumReply',
    useHook: () => useDeleteForumReply(CID, THREAD),
    vars: { replyId: 9, moderationReason: 'spam' },
    url: `/api/v1/forum/threads/${THREAD}/reply`,
    method: 'DELETE',
    body: { communityId: CID, replyId: 9, moderationReason: 'spam' },
    invalidates: ['forum.detail'],
  },
  {
    name: 'useOpenElection',
    useHook: () => useOpenElection(CID, ELECTION),
    vars: undefined,
    url: `/api/v1/elections/${ELECTION}/open`,
    method: 'POST',
    body: { communityId: CID },
    // `elections.all` is a bare prefix: every election view, every community.
    invalidates: ALL_ELECTIONS,
  },
  {
    name: 'useCloseElection',
    useHook: () => useCloseElection(CID, ELECTION),
    vars: undefined,
    url: `/api/v1/elections/${ELECTION}/close`,
    method: 'POST',
    body: { communityId: CID },
    invalidates: ALL_ELECTIONS,
  },
  {
    name: 'useCertifyElection',
    useHook: () => useCertifyElection(CID, ELECTION),
    vars: { resultsDocumentId: 42 },
    url: `/api/v1/elections/${ELECTION}/certify`,
    method: 'POST',
    body: { communityId: CID, resultsDocumentId: 42 },
    invalidates: ALL_ELECTIONS,
  },
  {
    name: 'useCancelElection',
    useHook: () => useCancelElection(CID, ELECTION),
    vars: { canceledReason: 'error in slate' },
    url: `/api/v1/elections/${ELECTION}/cancel`,
    method: 'POST',
    body: { communityId: CID, canceledReason: 'error in slate' },
    invalidates: ALL_ELECTIONS,
  },
  {
    name: 'useSnapshotEligibility',
    useHook: () => useSnapshotEligibility(CID, ELECTION),
    vars: undefined,
    url: `/api/v1/elections/${ELECTION}/eligibility`,
    method: 'POST',
    body: { communityId: CID },
    invalidates: ALL_ELECTIONS,
  },
  {
    name: 'useCastElectionVote',
    useHook: () => useCastElectionVote(CID, ELECTION),
    vars: { selectedCandidateIds: [1, 2] },
    url: `/api/v1/elections/${ELECTION}/vote`,
    method: 'POST',
    body: { communityId: CID, selectedCandidateIds: [1, 2] },
    invalidates: ALL_ELECTIONS,
  },
  {
    name: 'useCreateElectionProxy',
    useHook: () => useCreateElectionProxy(CID, ELECTION),
    vars: { proxyHolderUserId: 'u-2', grantorUnitId: 14 },
    url: `/api/v1/elections/${ELECTION}/proxies`,
    method: 'POST',
    body: { communityId: CID, proxyHolderUserId: 'u-2', grantorUnitId: 14 },
    // Proxy writes are narrow: this election's proxy list only.
    invalidates: ['elections.proxies'],
  },
  {
    name: 'useApproveElectionProxy',
    useHook: () => useApproveElectionProxy(CID, ELECTION),
    vars: 21,
    url: `/api/v1/elections/${ELECTION}/proxies/21/approve`,
    method: 'POST',
    body: { communityId: CID },
    invalidates: ['elections.proxies'],
  },
  {
    name: 'useRejectElectionProxy',
    useHook: () => useRejectElectionProxy(CID, ELECTION),
    vars: 21,
    url: `/api/v1/elections/${ELECTION}/proxies/21/reject`,
    method: 'POST',
    body: { communityId: CID },
    invalidates: ['elections.proxies'],
  },
  {
    name: 'useRevokeElectionProxy',
    useHook: () => useRevokeElectionProxy(CID, ELECTION),
    vars: 21,
    url: `/api/v1/elections/${ELECTION}/proxies/21/revoke`,
    method: 'POST',
    body: { communityId: CID },
    invalidates: ['elections.proxies'],
  },
];

describe('use-board mutations', () => {
  it('has exactly one row per mutation hook the module exports', () => {
    // Derived from the module itself, not from this table: every exported
    // `use*` function that is not a known query hook is treated as a mutation,
    // so a mutation added to use-board.ts without a row here goes red.
    const exportedMutations = Object.entries(boardModule)
      .filter(([name, value]) => /^use[A-Z]/.test(name) && typeof value === 'function')
      .map(([name]) => name)
      .filter((name) => !QUERY_HOOKS.includes(name))
      .sort();
    const tableNames = MUTATIONS.map((m) => m.name).sort();

    expect(tableNames).toEqual(exportedMutations);
    expect(exportedMutations).toHaveLength(16);
  });

  it.each(MUTATIONS)('$name sends the expected request and invalidates exactly its views', async (c) => {
    fetchMock.mockImplementation(async () => ok({ id: 1 }));
    const qc = newClient();
    seedUniverse(qc);

    const { result } = renderHook(() => c.useHook(), { wrapper: wrap(qc) });
    await act(async () => {
      await result.current.mutateAsync(c.vars);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastRequest()).toEqual({ url: c.url, method: c.method, body: c.body });
    expect(invalidatedNames(qc)).toEqual([...c.invalidates].sort());
  });

  it('invalidates nothing when the server refuses, and surfaces the server message', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Voting has closed' } }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const qc = newClient();
    seedUniverse(qc);

    const { result } = renderHook(() => useCastElectionVote(CID, ELECTION), { wrapper: wrap(qc) });
    await act(async () => {
      await expect(result.current.mutateAsync({ isAbstention: true })).rejects.toThrow('Voting has closed');
    });

    expect(invalidatedNames(qc)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Queries — key, URL, unwrapping, enabled gates
// ---------------------------------------------------------------------------

describe('use-board queries', () => {
  it('useBoardPolls walks /api/v1/polls with includeEnded and caches under the active/ended slice', async () => {
    fetchMock.mockImplementation(async () => page([{ id: 1, title: 'P' }]));
    const qc = newClient();

    const { result, rerender } = renderHook(
      ({ includeEnded }: { includeEnded: boolean }) => useBoardPolls(CID, { includeEnded }),
      { wrapper: wrap(qc), initialProps: { includeEnded: false } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 1, title: 'P' }]);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `/api/v1/polls?communityId=${CID}&includeEnded=false&pageSize=100`,
    );
    expect(qc.getQueryData(['board', 'polls', 'list', CID, 'active'])).toEqual([{ id: 1, title: 'P' }]);

    rerender({ includeEnded: true });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]![0]).toBe(
      `/api/v1/polls?communityId=${CID}&includeEnded=true&pageSize=100`,
    );
    await waitFor(() =>
      expect(qc.getQueryData(['board', 'polls', 'list', CID, 'ended'])).toEqual([{ id: 1, title: 'P' }]),
    );
  });

  it('useBoardElections clamps limit to 25 in both the URL and the key', async () => {
    fetchMock.mockImplementation(async () => ok([{ id: ELECTION }]));
    const qc = newClient();

    const { result } = renderHook(() => useBoardElections(CID, { limit: 500 }), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: ELECTION }]);
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/v1/elections?communityId=${CID}&limit=25`);
    expect(qc.getQueryData(['board', 'elections', 'list', CID, 25])).toEqual([{ id: ELECTION }]);
  });

  interface DetailCase {
    name: string;
    useHook: (id: number | null) => { isSuccess: boolean; data: unknown };
    url: string;
    key: QueryKey;
    noneKey: QueryKey;
  }

  const DETAILS: DetailCase[] = [
    {
      name: 'useBoardElectionReceipt',
      useHook: (id) => useBoardElectionReceipt(CID, id),
      url: `/api/v1/elections/${ELECTION}/my-vote?communityId=${CID}`,
      key: ['board', 'elections', 'my-vote', CID, ELECTION],
      noneKey: ['board', 'elections', 'my-vote', CID, 'none'],
    },
    {
      name: 'useBoardElectionDetail',
      useHook: (id) => useBoardElectionDetail(CID, id),
      url: `/api/v1/elections/${ELECTION}?communityId=${CID}`,
      key: ['board', 'elections', 'detail', CID, ELECTION],
      noneKey: ['board', 'elections', 'detail', CID, 'none'],
    },
    {
      name: 'useBoardElectionResults',
      useHook: (id) => useBoardElectionResults(CID, id),
      url: `/api/v1/elections/${ELECTION}/results?communityId=${CID}`,
      key: ['board', 'elections', 'results', CID, ELECTION],
      noneKey: ['board', 'elections', 'results', CID, 'none'],
    },
    {
      name: 'useBoardElectionProxies',
      useHook: (id) => useBoardElectionProxies(CID, id),
      url: `/api/v1/elections/${ELECTION}/proxies?communityId=${CID}`,
      key: ['board', 'elections', 'proxies', CID, ELECTION],
      noneKey: ['board', 'elections', 'proxies', CID, 'none'],
    },
    {
      name: 'useBoardPollResults',
      useHook: (id) => useBoardPollResults(CID, id === null ? null : POLL),
      url: `/api/v1/polls/${POLL}/results?communityId=${CID}`,
      key: ['board', 'polls', 'results', CID, POLL],
      noneKey: ['board', 'polls', 'results', CID, 'none'],
    },
    {
      name: 'useBoardPollMyVote',
      useHook: (id) => useBoardPollMyVote(CID, id === null ? null : POLL),
      url: `/api/v1/polls/${POLL}/my-vote?communityId=${CID}`,
      key: ['board', 'polls', 'my-vote', CID, POLL],
      noneKey: ['board', 'polls', 'my-vote', CID, 'none'],
    },
    {
      name: 'useBoardForumThread',
      useHook: (id) => useBoardForumThread(CID, id === null ? null : THREAD),
      url: `/api/v1/forum/threads/${THREAD}?communityId=${CID}`,
      key: ['board', 'forum', 'detail', CID, THREAD],
      noneKey: ['board', 'forum', 'detail', CID, 'none'],
    },
  ];

  it.each(DETAILS)('$name fetches its URL, unwraps { data }, and caches under its key', async (c) => {
    fetchMock.mockImplementation(async () => ok({ marker: c.name }));
    const qc = newClient();

    const { result } = renderHook(() => c.useHook(ELECTION), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(c.url);
    expect(result.current.data).toEqual({ marker: c.name });
    expect(qc.getQueryData(c.key)).toEqual({ marker: c.name });
  });

  it.each(DETAILS)('$name is disabled for a null id and parks under the "none" sentinel key', (c) => {
    const qc = newClient();
    renderHook(() => c.useHook(null), { wrapper: wrap(qc) });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(qc.getQueryCache().find({ queryKey: c.noneKey, exact: true })).toBeDefined();
  });

  it('every list/detail query is disabled for communityId 0', () => {
    const qc = newClient();
    renderHook(
      () => {
        useBoardPolls(0);
        useBoardElections(0);
        useBoardElectionDetail(0, ELECTION);
        useBoardPollResults(0, POLL);
        useBoardForumThread(0, THREAD);
      },
      { wrapper: wrap(qc) },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
