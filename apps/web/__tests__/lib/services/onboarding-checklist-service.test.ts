import { describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  selectFromMock,
  orderByMock,
  onboardingChecklistItemsMock,
  eqMock,
  andMock,
  isNullMock,
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
} from '../../../src/lib/services/onboarding-checklist-service';

describe('getItemKeysForRole — v3 role + designation resolution', () => {
  it('board_member designation → BOARD_MEMBER_ITEMS', () => {
    const keys = getItemKeysForRole('resident', 'board_member', 'condo_718');
    expect(keys).toEqual([...BOARD_MEMBER_ITEMS]);
  });

  it('board_president designation → admin base (condo)', () => {
    const keys = getItemKeysForRole('resident', 'board_president', 'condo_718');
    expect(keys).toEqual([...ADMIN_CONDO_ITEMS]);
    expect(keys).not.toContain('customize_portal');
  });

  it('board_president designation → admin base (apartment)', () => {
    const keys = getItemKeysForRole('resident', 'board_president', 'apartment');
    expect(keys).toEqual([...ADMIN_APARTMENT_ITEMS]);
  });

  it('root_manager (no designation) → admin base + PM_ADMIN_ITEMS', () => {
    const keys = getItemKeysForRole('root_manager', null, 'condo_718');
    expect(keys).toEqual([...ADMIN_CONDO_ITEMS, ...PM_ADMIN_ITEMS]);
    expect(keys).toContain('customize_portal');
  });

  it('property_manager (no designation, PM scope) → admin base + PM_ADMIN_ITEMS (apartment)', () => {
    const keys = getItemKeysForRole('property_manager', null, 'apartment');
    expect(keys).toEqual([...ADMIN_APARTMENT_ITEMS, ...PM_ADMIN_ITEMS]);
    expect(keys).toContain('customize_portal');
    expect(keys).not.toContain('review_compliance');
  });

  it('property_manager (no designation, PM scope) → admin base + PM_ADMIN_ITEMS', () => {
    const keys = getItemKeysForRole('property_manager', null, 'condo_718');
    expect(keys).toEqual([...ADMIN_CONDO_ITEMS, ...PM_ADMIN_ITEMS]);
    expect(keys).toContain('customize_portal');
  });

  it('resident (no designation) → OWNER_TENANT_ITEMS', () => {
    const keys = getItemKeysForRole('resident', null, 'condo_718');
    expect(keys).toEqual([...OWNER_TENANT_ITEMS]);
  });

  it('resident (no designation) → OWNER_TENANT_ITEMS regardless of community type', () => {
    const keys = getItemKeysForRole('resident', null, 'apartment');
    expect(keys).toEqual([...OWNER_TENANT_ITEMS]);
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
