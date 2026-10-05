import { describe, expect, it } from 'vitest';
import { toResidentItems } from '../use-leases';

// GET /api/v1/residents returns resident-service rows ({ userId, fullName, … }).
// The roster once read { id, name } from them, so every lease showed
// "Unknown resident" and the New lease picker could find no one.
describe('toResidentItems', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    userId: 'u-1', fullName: 'Alex Tenant', email: 'alex@example.test', role: 'resident', isUnitOwner: false, ...over,
  });

  it('maps the API row to the id, name and email the roster looks up', () => {
    expect(toResidentItems([row()])).toEqual([
      { id: 'u-1', name: 'Alex Tenant', email: 'alex@example.test', canLease: true },
    ]);
  });

  it('only tenants can be put on a lease; staff and owners still get a name', () => {
    const items = toResidentItems([
      row({ userId: 'm-1', fullName: 'Site Manager', role: 'property_manager' }),
      row({ userId: 'o-1', fullName: 'Owen Owner', isUnitOwner: true }),
    ]);
    expect(items.map((i) => [i.name, i.canLease])).toEqual([['Site Manager', false], ['Owen Owner', false]]);
  });

  it('falls back to the email, then a placeholder, when there is no name', () => {
    expect(toResidentItems([row({ fullName: '  ', email: 'x@example.test' }), row({ userId: 'u-2', fullName: null, email: null })]).map((i) => i.name))
      .toEqual(['x@example.test', 'Unnamed resident']);
  });

  it('a person with two roles appears once, leasable if either role is', () => {
    const items = toResidentItems([row({ role: 'property_manager' }), row()]);
    expect(items).toHaveLength(1);
    expect(items[0]!.canLease).toBe(true);
  });
});
