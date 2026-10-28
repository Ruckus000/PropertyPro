/**
 * The facts the public site is built from, against real Postgres.
 *
 * Two unauthenticated reads feed every public page:
 *   - `getCommunityPublicInfo` — the name, short name, city, state and unit count
 *     that linked fields such as {{city}} resolve from;
 *   - `getContactInfo` — the Contact section's address, office hours and (behind a
 *     toggle) the management contact.
 *
 * The unit tests beside them mock the query chain, so they can show what is asked
 * for but not that the columns exist or that the row comes back as written. These
 * cases read the real columns, including the case that matters most for a public
 * route: a community that is gone shows nothing, and one community never shows
 * another's address.
 *
 * Nothing is mocked — no-mock-guard forbids it under __tests__/integration/.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { getCommunityPublicInfo } from '@/lib/api/branding';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
import {
  type TestKitState,
  initTestKit,
  teardownTestKit,
  trackCommunityForCleanup,
  requireDatabaseUrlInCI,
  getDescribeDb,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('Public community facts integration tests');

const describeDb = getDescribeDb();

describeDb('public community facts (db-backed integration)', () => {
  let state: TestKitState;
  let fullCommunity = 0;
  let bareCommunity = 0;
  let deletedCommunity = 0;

  async function seedCommunity(
    label: string,
    extra: Record<string, unknown> = {},
  ): Promise<number> {
    const [row] = await state.db
      .insert(state.dbModule.communities)
      .values({
        name: `Facts ${label} ${state.runSuffix}`,
        slug: `facts-${label}-${state.runSuffix}`,
        communityType: 'condo_718',
        timezone: 'America/New_York',
        ...extra,
      })
      .returning({ id: state.dbModule.communities.id });
    if (!row) throw new Error(`Failed to create community "${label}"`);
    trackCommunityForCleanup(state, row.id);
    return row.id;
  }

  beforeAll(async () => {
    state = await initTestKit();
    fullCommunity = await seedCommunity('full', {
      shortName: 'Harbor Pointe',
      addressLine1: '100 Palm Way',
      addressLine2: 'Suite 4',
      city: 'Miami',
      state: 'FL',
      zipCode: '33101',
      unitCount: 120,
      officeHours: 'Mon-Fri, 9-5',
      contactName: 'Jane Manager',
      contactEmail: 'office@harbor-pointe.example',
      contactPhone: '(305) 555-0142',
    });
    // Sign-up collects no short name, hours or contact details, and a community
    // can be created with no address at all.
    bareCommunity = await seedCommunity('bare');
    deletedCommunity = await seedCommunity('deleted', {
      shortName: 'Gone',
      addressLine1: '1 Gone Street',
      city: 'Tampa',
      state: 'FL',
      zipCode: '33601',
      unitCount: 30,
      officeHours: 'Never',
      contactName: 'Nobody',
      deletedAt: new Date(),
    });
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  it('getCommunityPublicInfo returns the short name, city, state and unit count', async () => {
    const info = await getCommunityPublicInfo(fullCommunity);

    expect(info).toMatchObject({
      id: fullCommunity,
      shortName: 'Harbor Pointe',
      city: 'Miami',
      state: 'FL',
      unitCount: 120,
    });
  });

  it('getCommunityPublicInfo returns nulls, not blanks, for facts that were never given', async () => {
    const info = await getCommunityPublicInfo(bareCommunity);

    expect(info).toMatchObject({
      id: bareCommunity,
      shortName: null,
      city: null,
      state: null,
      unitCount: null,
    });
  });

  it('getCommunityPublicInfo returns nothing for a deleted community', async () => {
    await expect(getCommunityPublicInfo(deletedCommunity)).resolves.toBeNull();
  });

  it('getContactInfo builds the address and returns the office hours from the real columns', async () => {
    const contact = await getPublicCommunityScopedReader(fullCommunity).getContactInfo({
      showBoard: false,
      showManagement: false,
    });

    expect(contact.address).toBe('100 Palm Way, Suite 4, Miami, FL 33101');
    expect(contact.officeHours).toBe('Mon-Fri, 9-5');
  });

  it('getContactInfo keeps the management contact behind its toggle', async () => {
    const reader = getPublicCommunityScopedReader(fullCommunity);

    const off = await reader.getContactInfo({ showBoard: false, showManagement: false });
    expect(off.management).toBeNull();
    // Neither the toggle nor the address read let a person's details out.
    expect(JSON.stringify(off)).not.toContain('office@harbor-pointe.example');
    expect(JSON.stringify(off)).not.toContain('Jane Manager');
    expect(JSON.stringify(off)).not.toContain('555-0142');

    const on = await reader.getContactInfo({ showBoard: false, showManagement: true });
    expect(on.management).toEqual({
      name: 'Jane Manager',
      email: 'office@harbor-pointe.example',
      phone: '(305) 555-0142',
    });
  });

  it('getContactInfo returns nothing for a community with no address, hours or contact', async () => {
    const contact = await getPublicCommunityScopedReader(bareCommunity).getContactInfo({
      showBoard: true,
      showManagement: true,
    });

    expect(contact).toEqual({ management: null, board: [], address: null, officeHours: null });
  });

  it('getContactInfo returns nothing for a deleted community', async () => {
    const contact = await getPublicCommunityScopedReader(deletedCommunity).getContactInfo({
      showBoard: false,
      showManagement: true,
    });

    expect(contact.address).toBeNull();
    expect(contact.officeHours).toBeNull();
    expect(contact.management).toBeNull();
  });

  it("getContactInfo never shows one community another's address", async () => {
    const contact = await getPublicCommunityScopedReader(bareCommunity).getContactInfo({
      showBoard: false,
      showManagement: true,
    });

    expect(JSON.stringify(contact)).not.toContain('Palm Way');
    expect(JSON.stringify(contact)).not.toContain('Mon-Fri');
  });
});
