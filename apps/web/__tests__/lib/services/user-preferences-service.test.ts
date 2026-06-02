import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@propertypro/db', () => ({
  userPreferences: {
    userId: 'user_id_col',
    preferenceKey: 'preference_key_col',
    value: 'value_col',
  },
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ __eq: { col, val } })),
  and: vi.fn((...args: unknown[]) => ({ __and: args })),
}));

const { createUnscopedClientMock, selectLimitMock, insertValuesMock, onConflictMock, getInsertValues } =
  vi.hoisted(() => {
    const selectLimitMock = vi.fn();
    const onConflictMock = vi.fn().mockResolvedValue(undefined);
    let insertValuesArg: unknown;
    const insertValuesMock = vi.fn((v: unknown) => {
      insertValuesArg = v;
      return { onConflictDoUpdate: onConflictMock };
    });
    const createUnscopedClientMock = vi.fn(() => ({
      select: () => ({ from: () => ({ where: () => ({ limit: selectLimitMock }) }) }),
      insert: () => ({ values: insertValuesMock }),
    }));
    return {
      createUnscopedClientMock,
      selectLimitMock,
      insertValuesMock,
      onConflictMock,
      getInsertValues: () => insertValuesArg,
    };
  });

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

import { getUserPreference, setUserPreference } from '@/lib/services/user-preferences-service';

describe('user-preferences-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserPreference', () => {
    it('returns the stored value when present', async () => {
      selectLimitMock.mockResolvedValueOnce([{ value: { dismissed: true } }]);
      const result = await getUserPreference('user-1', 'pm_site_setup_banner_dismissed');
      expect(result).toEqual({ dismissed: true });
    });

    it('returns null when the preference has never been set', async () => {
      selectLimitMock.mockResolvedValueOnce([]);
      const result = await getUserPreference('user-1', 'pm_site_setup_banner_dismissed');
      expect(result).toBeNull();
    });
  });

  describe('setUserPreference', () => {
    it('upserts (insert + onConflictDoUpdate) the value for the user/key', async () => {
      await setUserPreference('user-1', 'pm_site_setup_banner_dismissed', { dismissed: true });
      expect(insertValuesMock).toHaveBeenCalledTimes(1);
      const values = getInsertValues() as { userId: string; preferenceKey: string; value: unknown };
      expect(values).toMatchObject({
        userId: 'user-1',
        preferenceKey: 'pm_site_setup_banner_dismissed',
        value: { dismissed: true },
      });
      expect(onConflictMock).toHaveBeenCalledTimes(1);
      const conflictArg = onConflictMock.mock.calls[0]![0] as { set: { value: unknown } };
      expect(conflictArg.set.value).toEqual({ dismissed: true });
    });
  });
});
