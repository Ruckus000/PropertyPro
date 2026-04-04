import { describe, expect, it } from 'vitest';
import { getPresetPermissions } from '@propertypro/shared';

describe('demo-conversion prerequisites', () => {
  describe('getPresetPermissions for founding user', () => {
    it('returns expected shape for board_president + condo_718', () => {
      const perms = getPresetPermissions('board_president', 'condo_718');

      // Must have a resources object with resource permission entries
      expect(perms).toHaveProperty('resources');
      expect(typeof perms.resources).toBe('object');

      // Must have meta-permission flags
      expect(perms.can_manage_roles).toBe(true);
      expect(perms.can_manage_settings).toBe(true);
      expect(perms.is_board_member).toBe(true);

      // Must have document_categories
      expect(perms).toHaveProperty('document_categories');

      // Resources should contain at least some known RBAC resources
      const resourceKeys = Object.keys(perms.resources);
      expect(resourceKeys.length).toBeGreaterThan(0);

      // Each resource entry should have read/write booleans
      for (const key of resourceKeys) {
        const entry = perms.resources[key as keyof typeof perms.resources];
        expect(typeof entry.read).toBe('boolean');
        expect(typeof entry.write).toBe('boolean');
      }
    });

    it('returns permissions that are not null or undefined', () => {
      const perms = getPresetPermissions('board_president', 'condo_718');
      // The whole point: the returned object must be truthy so it satisfies
      // the chk_manager_has_permissions CHECK constraint
      expect(perms).toBeTruthy();
      expect(perms.resources).toBeTruthy();
    });
  });
});
