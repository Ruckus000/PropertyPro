import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { eq } from '@propertypro/db/filters';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import {
  type TestKitState,
  getDescribeDb,
  initTestKit,
  requireCommunity,
  requireDatabaseUrlInCI,
  seedCommunities,
  teardownTestKit,
} from './helpers/multi-tenant-test-kit';
import {
  getUnitLabelMap,
  resolveUnitIdByLabel,
  searchUnitsByLabel,
} from '../../src/lib/services/units-lookup';

requireDatabaseUrlInCI('units-lookup');
const describeDb = getDescribeDb();

describeDb('units-lookup (db-backed integration)', () => {
  let state: TestKitState | null = null;
  let communityId: number;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;
    state = await initTestKit();
    await seedCommunities(
      state,
      MULTI_TENANT_COMMUNITIES.filter((c) => c.key === 'communityA'),
    );
    communityId = requireCommunity(state, 'communityA').id;
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  beforeEach(async () => {
    if (!state) return;
    const scoped = state.dbModule.createScopedClient(communityId);
    const existing = await scoped.query(state.dbModule.units);
    for (const row of existing) {
      const id = row['id'] as number;
      await scoped.hardDelete(state.dbModule.units, eq(state.dbModule.units.id, id));
    }
  });

  it('resolves an exact label to a single unit id (case-insensitive)', async () => {
    if (!state) return;
    const scoped = state.dbModule.createScopedClient(communityId);
    const [row] = await scoped.insert(state.dbModule.units, { unitNumber: '101A' });
    const expectedId = row!['id'] as number;

    const result = await resolveUnitIdByLabel(communityId, '101a');
    expect(result).toEqual({ kind: 'resolved', unitId: expectedId, unitNumber: '101A' });
  });

  it('returns not_found when no unit matches', async () => {
    const result = await resolveUnitIdByLabel(communityId, 'MISSING');
    expect(result).toEqual({ kind: 'not_found' });
  });

  it('returns ambiguous when duplicate labels exist in the community', async () => {
    if (!state) return;
    const scoped = state.dbModule.createScopedClient(communityId);
    await scoped.insert(state.dbModule.units, { unitNumber: 'DUPE' });
    await scoped.insert(state.dbModule.units, { unitNumber: 'DUPE' });

    const result = await resolveUnitIdByLabel(communityId, 'DUPE');
    expect(result.kind).toBe('ambiguous');
  });

  it('treats soft-deleted units as not found', async () => {
    if (!state) return;
    const scoped = state.dbModule.createScopedClient(communityId);
    const [row] = await scoped.insert(state.dbModule.units, { unitNumber: 'DEL' });
    const unitId = row!['id'] as number;
    await scoped.softDelete(state.dbModule.units, eq(state.dbModule.units.id, unitId));

    const result = await resolveUnitIdByLabel(communityId, 'DEL');
    expect(result).toEqual({ kind: 'not_found' });
  });

  it('searchUnitsByLabel returns prefix matches ordered by label', async () => {
    if (!state) return;
    const scoped = state.dbModule.createScopedClient(communityId);
    await scoped.insert(state.dbModule.units, { unitNumber: '101A' });
    await scoped.insert(state.dbModule.units, { unitNumber: '101B' });
    await scoped.insert(state.dbModule.units, { unitNumber: '202C' });

    const results = await searchUnitsByLabel(communityId, '101', 10);
    expect(results.map((r) => r.unitNumber)).toEqual(['101A', '101B']);
  });

  it('getUnitLabelMap returns labels keyed by id', async () => {
    if (!state) return;
    const scoped = state.dbModule.createScopedClient(communityId);
    const [a] = await scoped.insert(state.dbModule.units, { unitNumber: 'A1' });
    const [b] = await scoped.insert(state.dbModule.units, { unitNumber: 'B2' });
    const aId = a!['id'] as number;
    const bId = b!['id'] as number;

    const map = await getUnitLabelMap(communityId, [aId, bId]);
    expect(map.get(aId)).toBe('A1');
    expect(map.get(bId)).toBe('B2');
  });

  it('getUnitLabelMap returns empty map for empty input', async () => {
    const map = await getUnitLabelMap(communityId, []);
    expect(map.size).toBe(0);
  });
});
