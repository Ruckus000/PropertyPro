/**
 * `updateResidentUser` (the manager-side PATCH /api/v1/residents writer) must
 * drop phone verification when it changes a resident's number — the same rule
 * `updateUserProfile` applies. `users` is platform-level, so a manager in one
 * community re-pointing a verified number would otherwise redirect every
 * community's "verified" emergency SMS.
 *
 * The SQL semantics of the `case` expression (same number keeps, new or null
 * clears) are proven against a real database by
 * `integration/profile-phone-verification-reset.integration.test.ts`; this
 * pins that the resident writer sends it.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { updateMock } = vi.hoisted(() => ({ updateMock: vi.fn() }));

vi.mock('@propertypro/db', () => ({
  createScopedClient: () => ({ update: updateMock }),
  users: { id: 'users.id', phone: 'users.phone', phoneVerifiedAt: 'users.phone_verified_at' },
  communities: {},
  notificationPreferences: {},
  userRoles: {},
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  inArray: (col: unknown, vals: unknown) => ({ __inArray: { col, vals } }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ __sql: strings.join('?'), values }),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  findCommunityResidentPortalActivity: vi.fn(),
}));

import { updateResidentUser } from '../../../src/lib/services/resident-service';

describe('updateResidentUser phone verification', () => {
  beforeEach(() => {
    updateMock.mockReset();
    updateMock.mockResolvedValue(undefined);
  });

  it('adds a phoneVerifiedAt reset expression when the phone is written', async () => {
    await updateResidentUser(7, 'user-1', { phone: '+13055559999', fullName: 'Pat' });

    const values = updateMock.mock.calls[0]![1] as Record<string, unknown>;
    expect(values['phone']).toBe('+13055559999');
    expect(values['fullName']).toBe('Pat');
    expect(values).toHaveProperty('phoneVerifiedAt');
    // A SQL case expression keyed on the stored vs new number — not a literal.
    expect(values['phoneVerifiedAt']).toEqual({
      __sql: 'case when ? is not distinct from ? then ? else null end',
      values: ['users.phone', '+13055559999', 'users.phone_verified_at'],
    });
  });

  it('adds it when the phone is cleared to null', async () => {
    await updateResidentUser(7, 'user-1', { phone: null });

    const values = updateMock.mock.calls[0]![1] as Record<string, unknown>;
    expect(values).toHaveProperty('phoneVerifiedAt');
  });

  it('leaves verification alone when phone is present but undefined (drizzle drops it)', async () => {
    await updateResidentUser(7, 'user-1', { fullName: 'Pat', phone: undefined });

    const values = updateMock.mock.calls[0]![1] as Record<string, unknown>;
    expect(values).not.toHaveProperty('phoneVerifiedAt');
  });

  it('leaves verification alone when the phone is not written', async () => {
    await updateResidentUser(7, 'user-1', { fullName: 'Pat' });

    const values = updateMock.mock.calls[0]![1] as Record<string, unknown>;
    expect(values).toEqual({ fullName: 'Pat' });
  });
});
