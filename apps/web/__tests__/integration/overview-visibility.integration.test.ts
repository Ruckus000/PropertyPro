/**
 * The cross-community overview (`GET /api/v1/overview`) shows each member only
 * what the feature's own route would — against a real database.
 *
 * Route-authz census F2 (2026-09-28): the overview's activity feed selected
 * every document and announcement in the community with no role filter, and
 * the compliance card went to every member. A tenant saw titles of board-only
 * announcements and of violation-evidence documents, plus the compliance
 * score (condo tenants have `compliance.read = false`). The overview route's
 * unit test mocks this whole module, so only a database-backed test can pin it.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { getActivityFeed, getCommunityCards } from '../../src/lib/queries/cross-community';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS } from '../fixtures/multi-tenant-users';
import {
  type TestKitState,
  getDescribeDb,
  initTestKit,
  requireCommunity,
  requireDatabaseUrlInCI,
  requireUser,
  seedCommunities,
  seedUsers,
  teardownTestKit,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('overview-visibility');
const describeDb = getDescribeDb();

describeDb('overview visibility (integration)', () => {
  let kit: TestKitState | null = null;
  const t = (label: string) => `OVERVIEW_${label}_${kit!.runSuffix}`;

  beforeAll(async () => {
    kit = await initTestKit();
    await seedCommunities(kit, MULTI_TENANT_COMMUNITIES.filter((c) => c.key === 'communityA'));
    await seedUsers(
      kit,
      MULTI_TENANT_USERS.filter((u) => u.key === 'tenantA' || u.key === 'actorA'),
    );

    const communityId = requireCommunity(kit, 'communityA').id;
    const managerId = requireUser(kit, 'actorA').id;
    const scoped = kit.dbModule.createScopedClient(communityId);

    await scoped.insert(kit.dbModule.announcements, {
      title: t('ALL'),
      body: 'visible to everyone',
      audience: 'all',
      publishedBy: managerId,
    });
    await scoped.insert(kit.dbModule.announcements, {
      title: t('BOARD'),
      body: 'board only',
      audience: 'board_only',
      publishedBy: managerId,
    });
    await scoped.insert(kit.dbModule.documents, {
      title: t('EVIDENCE'),
      filePath: `communities/${communityId}/documents/evidence.jpg`,
      fileName: 'evidence.jpg',
      fileSize: 10,
      mimeType: 'image/jpeg',
      sourceType: 'violation_evidence',
    });
    await scoped.insert(kit.dbModule.complianceChecklistItems, {
      templateKey: `overview-${kit.runSuffix}`,
      title: 'Budget',
      category: 'financial',
      isApplicable: true,
    });
  });

  afterAll(async () => {
    if (kit) await teardownTestKit(kit);
  });

  it('shows a tenant the "all" announcement but not the board-only one', async () => {
    const titles = (await getActivityFeed(requireUser(kit!, 'tenantA').id)).map((i) => i.title);

    expect(titles).toContain(t('ALL'));
    expect(titles).not.toContain(t('BOARD'));
  });

  it('never lists violation-evidence documents in a tenant\'s feed', async () => {
    const titles = (await getActivityFeed(requireUser(kit!, 'tenantA').id)).map((i) => i.title);

    expect(titles).not.toContain(t('EVIDENCE'));
  });

  it('still shows a manager the board-only announcement (not vacuous)', async () => {
    const titles = (await getActivityFeed(requireUser(kit!, 'actorA').id)).map((i) => i.title);

    expect(titles).toContain(t('BOARD'));
  });

  it('withholds the compliance score from a tenant but not from a manager', async () => {
    const communityId = requireCommunity(kit!, 'communityA').id;
    const tenantCard = (await getCommunityCards(requireUser(kit!, 'tenantA').id)).find(
      (c) => c.communityId === communityId,
    );
    const managerCard = (await getCommunityCards(requireUser(kit!, 'actorA').id)).find(
      (c) => c.communityId === communityId,
    );

    expect(tenantCard?.complianceScore).toBeNull();
    expect(managerCard?.complianceScore).toBe(0);
  });
});
