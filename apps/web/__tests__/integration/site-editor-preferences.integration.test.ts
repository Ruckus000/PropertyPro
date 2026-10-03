/**
 * The website editor's per-user state (builder v4, Phase 3), against a real
 * database.
 *
 * Two properties a mocked service cannot prove:
 *  - Each manager sees only their OWN state, even in the same community — the
 *    rows are keyed by the session user, never by the request.
 *  - Two changes sent at once both survive. They are merged in one statement
 *    (`mergeUserPreference`, jsonb `||`); a read-modify-write would keep only
 *    the last one.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS, type MultiTenantUserKey } from '../fixtures/multi-tenant-users';
import {
  type TestKitState,
  apiUrl,
  getDescribeDb,
  initTestKit,
  jsonRequest,
  parseJson,
  requireCommunity,
  requireDatabaseUrlInCI,
  seedCommunities,
  seedUsers,
  setActor,
  teardownTestKit,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('Site editor preferences integration tests');

const describeDb = getDescribeDb();

// Authentication comes from the shared integration setup: `setActor()`
// decides who the route sees. No mocks — `guard:no-mock` forbids them.

type RouteModule = typeof import('../../src/app/api/v1/pm/site-editor/preferences/route');

let state: TestKitState | null = null;
let route: RouteModule | null = null;

function kit(): TestKitState {
  if (!state) throw new Error('Test state not initialized');
  return state;
}
function loaded(): RouteModule {
  if (!route) throw new Error('Route not loaded');
  return route;
}
const URL = '/api/v1/pm/site-editor/preferences';

interface Prefs {
  mode: string | null;
  tourDone: boolean;
  marked: string[];
  visited: string[];
}

async function read(): Promise<Prefs> {
  const id = requireCommunity(kit(), 'communityA').id;
  const res = await loaded().GET(jsonRequest(apiUrl(`${URL}?communityId=${id}`), 'GET'));
  expect(res.status).toBe(200);
  return (await parseJson<{ data: Prefs }>(res)).data;
}

async function change(body: Record<string, unknown>): Promise<Response> {
  const id = requireCommunity(kit(), 'communityA').id;
  return loaded().PATCH(jsonRequest(apiUrl(URL), 'PATCH', { communityId: id, ...body }));
}

describeDb('site editor preferences', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;
    state = await initTestKit();
    const communityA = MULTI_TENANT_COMMUNITIES.find((c) => c.key === 'communityA');
    if (!communityA) throw new Error('communityA fixture missing');
    await seedCommunities(state, [communityA]);
    const needed: MultiTenantUserKey[] = ['actorA', 'camA', 'tenantA'];
    await seedUsers(state, MULTI_TENANT_USERS.filter((u) => needed.includes(u.key)));
    route = await import('../../src/app/api/v1/pm/site-editor/preferences/route');
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  it('one manager’s state is invisible to another manager of the same community', async () => {
    setActor(kit(), 'actorA');
    expect((await change({ mode: 'guided', visit: 'design', mark: 'welcome' })).status).toBe(200);
    expect(await read()).toEqual({ mode: 'guided', tourDone: false, marked: ['welcome'], visited: ['design'] });

    setActor(kit(), 'camA');
    expect(await read()).toEqual({ mode: null, tourDone: false, marked: [], visited: [] });
  });

  it('two changes sent at once both survive', async () => {
    setActor(kit(), 'camA');
    const results = await Promise.all([
      change({ visit: 'pages' }),
      change({ visit: 'phone' }),
      change({ mark: 'photo' }),
      change({ mode: 'free' }),
      change({ tourDone: true }),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);

    const prefs = await read();
    expect([...prefs.visited].sort()).toEqual(['pages', 'phone']);
    expect(prefs.marked).toEqual(['photo']);
    expect(prefs).toMatchObject({ mode: 'free', tourDone: true });
  });

  it('unmarking keeps the other values', async () => {
    setActor(kit(), 'camA');
    expect((await change({ unmark: 'photo' })).status).toBe(200);
    const prefs = await read();
    expect(prefs.marked).toEqual([]);
    expect([...prefs.visited].sort()).toEqual(['pages', 'phone']);
  });

  it('a resident is refused and writes nothing', async () => {
    setActor(kit(), 'tenantA');
    expect((await change({ mode: 'guided' })).status).toBe(403);
    const id = requireCommunity(kit(), 'communityA').id;
    const res = await loaded().GET(jsonRequest(apiUrl(`${URL}?communityId=${id}`), 'GET'));
    expect(res.status).toBe(403);
  });
});
