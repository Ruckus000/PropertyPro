/**
 * `updateCommunityContact` and its optional executor.
 *
 * The community profile save writes the contact columns inside its transaction,
 * so this writer must build its scoped client on the handle it is given. Without
 * one it writes on the pool, exactly as the contact route has always relied on.
 * (That the write really rolls back with the rest is proven against Postgres in
 * `integration/community-profile.integration.test.ts`.)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createScopedClientMock, updateMock } = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  communities: { id: 'communities.id' },
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
}));

import { updateCommunityContact } from '@/lib/services/community-contact-service';

const EXECUTOR = { executor: 'a transaction handle' };

beforeEach(() => {
  vi.clearAllMocks();
  createScopedClientMock.mockReturnValue({ update: updateMock });
  updateMock.mockResolvedValue([
    { contactName: 'Jane Manager', contactEmail: 'office@sunset.example', contactPhone: null },
  ]);
});

describe('updateCommunityContact', () => {
  it('writes through the executor it is given', async () => {
    const result = await updateCommunityContact(
      42,
      { contactName: 'Jane Manager', contactEmail: 'office@sunset.example' },
      EXECUTOR as never,
    );

    expect(createScopedClientMock).toHaveBeenCalledTimes(1);
    expect(createScopedClientMock).toHaveBeenCalledWith(42, EXECUTOR);
    expect(updateMock).toHaveBeenCalledWith(
      { id: 'communities.id' },
      { contactName: 'Jane Manager', contactEmail: 'office@sunset.example' },
      { __eq: { col: 'communities.id', val: 42 } },
    );
    expect(result.contact).toEqual({
      contactName: 'Jane Manager',
      contactEmail: 'office@sunset.example',
      contactPhone: null,
    });
  });

  it('writes on the pool when there is no executor, as the contact route does', async () => {
    await updateCommunityContact(42, { contactPhone: '305-555-0100' });

    expect(createScopedClientMock).toHaveBeenCalledTimes(1);
    expect(createScopedClientMock.mock.calls[0]![0]).toBe(42);
    expect(createScopedClientMock.mock.calls[0]![1]).toBeUndefined();
  });

  it('writes only the keys it is given: undefined leaves a column alone, null clears it', async () => {
    const result = await updateCommunityContact(42, { contactName: null, contactEmail: undefined });

    expect(updateMock.mock.calls[0]![1]).toStrictEqual({ contactName: null });
    expect(result.updateData).toStrictEqual({ contactName: null });
  });
});
