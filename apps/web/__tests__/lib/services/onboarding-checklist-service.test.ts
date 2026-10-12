import { describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  selectFromMock,
  orderByMock,
  onboardingChecklistItemsMock,
  eqMock,
  andMock,
  isNullMock,
  getDocumentCategoryNamesMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  selectFromMock: vi.fn(),
  orderByMock: vi.fn(),
  onboardingChecklistItemsMock: {
    id: Symbol('id'),
    itemKey: Symbol('itemKey'),
    userId: Symbol('userId'),
    completedAt: Symbol('completedAt'),
    createdAt: Symbol('createdAt'),
    deletedAt: Symbol('deletedAt'),
  },
  eqMock: vi.fn(),
  andMock: vi.fn(),
  isNullMock: vi.fn(),
  getDocumentCategoryNamesMock: vi.fn(),
}));

vi.mock('@/lib/services/document-category-service', () => ({
  getDocumentCategoryNames: getDocumentCategoryNamesMock,
}));

// Mock @propertypro/db so the module can be imported without a built package
vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  onboardingChecklistItems: onboardingChecklistItemsMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: eqMock,
  and: andMock,
  isNull: isNullMock,
}));

import {
  getItemKeysForRole,
  PM_ADMIN_ITEMS,
  BOARD_MEMBER_ITEMS,
  OWNER_TENANT_ITEMS,
  ADMIN_CONDO_ITEMS,
  ADMIN_APARTMENT_ITEMS,
  getChecklistItems,
  completeDocumentSteps,
} from '../../../src/lib/services/onboarding-checklist-service';

type Member = Parameters<typeof getItemKeysForRole>[0];
const member = (over: Partial<Member>): Member => ({
  role: 'resident',
  designation: null,
  communityType: 'condo_718',
  isUnitOwner: true,
  ...over,
});

describe('getItemKeysForRole — tasks a person can actually do', () => {
  it('root_manager → admin base + PM_ADMIN_ITEMS', () => {
    const keys = getItemKeysForRole(member({ role: 'root_manager', isUnitOwner: false }));
    expect(keys).toEqual([...ADMIN_CONDO_ITEMS, ...PM_ADMIN_ITEMS]);
    expect(keys).toContain('customize_portal');
  });

  it('property_manager → admin base + PM_ADMIN_ITEMS (apartment has no compliance task)', () => {
    const keys = getItemKeysForRole(
      member({ role: 'property_manager', communityType: 'apartment', isUnitOwner: false }),
    );
    expect(keys).toEqual([...ADMIN_APARTMENT_ITEMS, ...PM_ADMIN_ITEMS]);
    expect(keys).not.toContain('review_compliance');
  });

  it('a manager keeps the admin tasks even with a board designation', () => {
    const keys = getItemKeysForRole(
      member({ role: 'property_manager', designation: 'board_president', isUnitOwner: false }),
    );
    expect(keys).toEqual([...ADMIN_CONDO_ITEMS, ...PM_ADMIN_ITEMS]);
  });

  // Onboarding audit F6: a board title grants no write permission, so the
  // admin tasks used to 403 for a resident board president and the list could
  // never complete.
  it('a resident board president gets the board tasks, not setup tasks they cannot do', () => {
    const keys = getItemKeysForRole(member({ designation: 'board_president' }));
    expect(keys).toEqual([...BOARD_MEMBER_ITEMS]);
    for (const adminOnly of ['add_units', 'invite_first_member', 'upload_first_document']) {
      expect(keys).not.toContain(adminOnly);
    }
  });

  it('a condo owner board member keeps the compliance check (owners can read compliance)', () => {
    const keys = getItemKeysForRole(member({ designation: 'board_member' }));
    expect(keys).toEqual([...BOARD_MEMBER_ITEMS]);
    expect(keys).toContain('check_compliance');
  });

  it('a tenant board member gets no compliance check (tenants cannot read compliance)', () => {
    const keys = getItemKeysForRole(member({ designation: 'board_member', isUnitOwner: false }));
    expect(keys).toEqual(BOARD_MEMBER_ITEMS.filter((key) => key !== 'check_compliance'));
  });

  it('an apartment board member gets no compliance check (apartments have none)', () => {
    const keys = getItemKeysForRole(
      member({ designation: 'board_member', communityType: 'apartment', isUnitOwner: false }),
    );
    expect(keys).not.toContain('check_compliance');
  });

  it('resident (no designation) → OWNER_TENANT_ITEMS regardless of community type', () => {
    expect(getItemKeysForRole(member({}))).toEqual([...OWNER_TENANT_ITEMS]);
    expect(getItemKeysForRole(member({ communityType: 'apartment', isUnitOwner: false }))).toEqual([
      ...OWNER_TENANT_ITEMS,
    ]);
  });
});

describe('getChecklistItems', () => {
  it('never returns a soft-deleted onboarding row', async () => {
    vi.clearAllMocks();
    const activeUserCondition = Symbol('active-user');
    const activeRowCondition = Symbol('active-row');
    const combinedCondition = Symbol('combined');
    const rows = [{ id: 1, itemKey: 'add_units', completedAt: null, createdAt: new Date() }];

    eqMock.mockReturnValue(activeUserCondition);
    isNullMock.mockReturnValue(activeRowCondition);
    andMock.mockReturnValue(combinedCondition);
    orderByMock.mockResolvedValue(rows);
    selectFromMock.mockReturnValue({ orderBy: orderByMock });
    createScopedClientMock.mockReturnValue({ selectFrom: selectFromMock });

    await expect(getChecklistItems(42, 'user-1')).resolves.toEqual(rows);

    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(isNullMock).toHaveBeenCalledWith(onboardingChecklistItemsMock.deletedAt);
    expect(andMock).toHaveBeenCalledWith(activeUserCondition, activeRowCondition);
    expect(selectFromMock).toHaveBeenCalledWith(
      onboardingChecklistItemsMock,
      expect.objectContaining({
        id: onboardingChecklistItemsMock.id,
        itemKey: onboardingChecklistItemsMock.itemKey,
      }),
      combinedCondition,
    );
  });
});

// Audit F6: "Upload your community rules" completed on ANY upload (a lease
// ticked it). Only a document filed under the rules category may.
describe('completeDocumentSteps', () => {
  /** The item keys passed to `markItemComplete`'s update, in order. */
  async function completedKeys(categoryName: string | undefined, categoryId: number | null = 7) {
    vi.clearAllMocks();
    const updateMock = vi.fn().mockResolvedValue(undefined);
    createScopedClientMock.mockReturnValue({ update: updateMock });
    eqMock.mockImplementation((column: unknown, value: unknown) => ({ column, value }));
    andMock.mockImplementation((...conditions: unknown[]) => conditions);
    getDocumentCategoryNamesMock.mockResolvedValue(
      new Map(categoryName === undefined ? [] : [[7, categoryName]]),
    );
    await completeDocumentSteps(42, 'user-1', categoryId);
    return updateMock.mock.calls.map(([, , where]) =>
      (where as Array<{ column: unknown; value: unknown }>).find(
        (c) => c.column === onboardingChecklistItemsMock.itemKey,
      )?.value,
    );
  }

  it('completes both steps for a document filed under Rules', async () => {
    expect(await completedKeys('Rules')).toEqual(['upload_first_document', 'upload_community_rules']);
  });

  it('completes only the first-document step for any other category', async () => {
    expect(await completedKeys('Lease Agreements')).toEqual(['upload_first_document']);
  });

  it('completes only the first-document step when the category is unknown or absent', async () => {
    expect(await completedKeys(undefined)).toEqual(['upload_first_document']);
    expect(await completedKeys('Rules', null)).toEqual(['upload_first_document']);
  });

  it('never throws when the category lookup fails', async () => {
    vi.clearAllMocks();
    createScopedClientMock.mockReturnValue({ update: vi.fn().mockResolvedValue(undefined) });
    getDocumentCategoryNamesMock.mockRejectedValue(new Error('db down'));
    await expect(completeDocumentSteps(42, 'user-1', 7)).resolves.toBeUndefined();
  });
});
