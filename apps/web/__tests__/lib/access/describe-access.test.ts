import { COMMUNITY_TYPES, MATRIX_ROLES, RBAC_MATRIX, RBAC_RESOURCES } from '@propertypro/shared';
import { describe, expect, it } from 'vitest';
import { describeAccess } from '@/lib/access/describe-access';

const WORD = { manager: 'Managers', owner: 'Owners', tenant: 'Tenants' } as const;
const cases = COMMUNITY_TYPES.flatMap((type) => RBAC_RESOURCES.map((resource) => [type, resource] as const));

describe('describeAccess', () => {
  it.each(cases)('%s %s names exactly the roles the matrix admits', (type, resource) => {
    const sentence = describeAccess(type, resource);
    for (const role of MATRIX_ROLES) {
      const canRead = RBAC_MATRIX[type][role][resource].read;
      const named = sentence.includes(WORD[role]) || (role !== 'manager' && sentence.includes('Residents'));
      expect(named, `${role}: "${sentence}"`).toBe(canRead);
    }
  });
  it.each(cases)('%s %s says Residents only when owners and tenants can do the same', (type, resource) => {
    if (!describeAccess(type, resource).includes('Residents')) return;
    const { owner, tenant } = RBAC_MATRIX[type];
    expect(owner[resource]).toEqual(tenant[resource]);
    expect(owner[resource].read).toBe(true);
  });
  it('says when residents see only their own', () => {
    expect(describeAccess('condo_718', 'packages', 'own')).toBe('Managers can add and change these. Residents can see only their own.');
  });
  it('says when owners see only what was sent to them, and never names tenants who cannot read', () => {
    expect(describeAccess('condo_718', 'emergency_broadcasts', 'sent-to-them')).toBe('Managers can add and change these. Owners can see only the ones sent to them.');
  });
  it('never claims something can be undone', () => {
    for (const [type, resource] of cases) expect(describeAccess(type, resource)).not.toMatch(/undo|undone|restore/i);
  });
});
