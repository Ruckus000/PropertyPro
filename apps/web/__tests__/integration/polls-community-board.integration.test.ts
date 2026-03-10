import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS, type MultiTenantUserKey } from '../fixtures/multi-tenant-users';
import {
  type TestKitState,
  apiUrl,
  getDescribeDb,
  initTestKit,
  jsonRequest,
  parseJson,
  readNumberField,
  requireCommunity,
  requireDatabaseUrlInCI,
  seedCommunities,
  seedUsers,
  setActor,
  teardownTestKit,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('WS68 polls/community-board integration tests');

const describeDb = getDescribeDb();

type PollsRouteModule = typeof import('../../src/app/api/v1/polls/route');
type PollVoteRouteModule = typeof import('../../src/app/api/v1/polls/[id]/vote/route');
type PollResultsRouteModule = typeof import('../../src/app/api/v1/polls/[id]/results/route');
type ForumThreadsRouteModule = typeof import('../../src/app/api/v1/forum/threads/route');
type ForumThreadRouteModule = typeof import('../../src/app/api/v1/forum/threads/[id]/route');
type ForumReplyRouteModule = typeof import('../../src/app/api/v1/forum/threads/[id]/reply/route');

interface RouteModules {
  polls: PollsRouteModule;
  pollVote: PollVoteRouteModule;
  pollResults: PollResultsRouteModule;
  forumThreads: ForumThreadsRouteModule;
  forumThread: ForumThreadRouteModule;
  forumReply: ForumReplyRouteModule;
}

let state: TestKitState | null = null;
let routes: RouteModules | null = null;

function requireState(): TestKitState {
  if (!state) {
    throw new Error('Test state not initialized');
  }
  return state;
}

function requireRoutes(): RouteModules {
  if (!routes) {
    throw new Error('Route modules not loaded');
  }
  return routes;
}

describeDb('WS68 polls/community board (db-backed integration)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();

    const selectedCommunities = MULTI_TENANT_COMMUNITIES.filter((community) =>
      ['communityA', 'communityB', 'communityC'].includes(community.key),
    );
    await seedCommunities(state, selectedCommunities);

    const neededUsers: MultiTenantUserKey[] = ['actorA', 'residentA', 'tenantA', 'actorB', 'actorC', 'tenantC'];
    await seedUsers(
      state,
      MULTI_TENANT_USERS.filter((user) => neededUsers.includes(user.key)),
    );

    routes = {
      polls: await import('../../src/app/api/v1/polls/route'),
      pollVote: await import('../../src/app/api/v1/polls/[id]/vote/route'),
      pollResults: await import('../../src/app/api/v1/polls/[id]/results/route'),
      forumThreads: await import('../../src/app/api/v1/forum/threads/route'),
      forumThread: await import('../../src/app/api/v1/forum/threads/[id]/route'),
      forumReply: await import('../../src/app/api/v1/forum/threads/[id]/reply/route'),
    };
  });

  beforeEach(() => {
    const kit = requireState();
    setActor(kit, 'actorA');
  });

  afterAll(async () => {
    if (state) {
      await teardownTestKit(state);
    }
  });

  it('runs poll create -> vote -> results lifecycle and rejects duplicate votes', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');

    setActor(kit, 'residentA');
    const createPollResponse = await routeModules.polls.POST(
      jsonRequest(apiUrl('/api/v1/polls'), 'POST', {
        communityId: communityA.id,
        title: `Pool Hours Poll ${kit.runSuffix}`,
        description: 'Choose preferred weekend pool hours',
        pollType: 'single_choice',
        options: ['8am - 6pm', '9am - 7pm', '10am - 8pm'],
      }),
    );
    expect(createPollResponse.status).toBe(201);
    const createPollJson = await parseJson<{ data: Record<string, unknown> }>(createPollResponse);
    const pollId = readNumberField(createPollJson.data, 'id');

    setActor(kit, 'tenantA');
    const voteResponse = await routeModules.pollVote.POST(
      jsonRequest(apiUrl(`/api/v1/polls/${pollId}/vote`), 'POST', {
        communityId: communityA.id,
        selectedOptions: ['9am - 7pm'],
      }),
      { params: Promise.resolve({ id: String(pollId) }) },
    );
    expect(voteResponse.status).toBe(201);

    const duplicateVoteResponse = await routeModules.pollVote.POST(
      jsonRequest(apiUrl(`/api/v1/polls/${pollId}/vote`), 'POST', {
        communityId: communityA.id,
        selectedOptions: ['10am - 8pm'],
      }),
      { params: Promise.resolve({ id: String(pollId) }) },
    );
    expect(duplicateVoteResponse.status).toBe(409);

    setActor(kit, 'actorA');
    const resultsResponse = await routeModules.pollResults.GET(
      new NextRequest(apiUrl(`/api/v1/polls/${pollId}/results?communityId=${communityA.id}`)),
      { params: Promise.resolve({ id: String(pollId) }) },
    );
    expect(resultsResponse.status).toBe(200);
    const resultsJson = await parseJson<{
      data: {
        totalVotes: number;
        options: Array<{ option: string; votes: number }>;
      };
    }>(resultsResponse);

    expect(resultsJson.data.totalVotes).toBe(1);
    const winningOption = resultsJson.data.options.find((option) => option.option === '9am - 7pm');
    expect(winningOption?.votes).toBe(1);
  });

  it('runs forum thread lifecycle with moderation and cross-tenant isolation', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const communityB = requireCommunity(kit, 'communityB');

    setActor(kit, 'tenantA');
    const createThreadResponse = await routeModules.forumThreads.POST(
      jsonRequest(apiUrl('/api/v1/forum/threads'), 'POST', {
        communityId: communityA.id,
        title: `Landscaping Discussion ${kit.runSuffix}`,
        body: 'Can we add more shade trees near building A?',
      }),
    );
    expect(createThreadResponse.status).toBe(201);
    const createThreadJson = await parseJson<{ data: Record<string, unknown> }>(createThreadResponse);
    const threadId = readNumberField(createThreadJson.data, 'id');

    setActor(kit, 'actorA');
    const replyResponse = await routeModules.forumReply.POST(
      jsonRequest(apiUrl(`/api/v1/forum/threads/${threadId}/reply`), 'POST', {
        communityId: communityA.id,
        body: 'Great idea. Please share your preferred tree list.',
      }),
      { params: Promise.resolve({ id: String(threadId) }) },
    );
    expect(replyResponse.status).toBe(201);

    const lockResponse = await routeModules.forumThread.PATCH(
      jsonRequest(apiUrl(`/api/v1/forum/threads/${threadId}`), 'PATCH', {
        communityId: communityA.id,
        isPinned: true,
        isLocked: true,
      }),
      { params: Promise.resolve({ id: String(threadId) }) },
    );
    expect(lockResponse.status).toBe(200);

    setActor(kit, 'tenantA');
    const unauthorizedModeration = await routeModules.forumThread.PATCH(
      jsonRequest(apiUrl(`/api/v1/forum/threads/${threadId}`), 'PATCH', {
        communityId: communityA.id,
        isLocked: false,
      }),
      { params: Promise.resolve({ id: String(threadId) }) },
    );
    expect(unauthorizedModeration.status).toBe(403);

    setActor(kit, 'actorB');
    const crossTenantRead = await routeModules.forumThread.GET(
      new NextRequest(apiUrl(`/api/v1/forum/threads/${threadId}?communityId=${communityB.id}`)),
      { params: Promise.resolve({ id: String(threadId) }) },
    );
    expect([403, 404]).toContain(crossTenantRead.status);
  });
});
