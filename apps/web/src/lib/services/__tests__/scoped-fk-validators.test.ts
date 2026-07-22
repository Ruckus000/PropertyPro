import { describe, expect, it, vi } from 'vitest';
import { ValidationError } from '@/lib/api/errors';

// The validator imports `units`/`documents` table objects from `@propertypro/db`,
// whose barrel eagerly constructs the drizzle client (requires DATABASE_URL).
// Stub the module so this pure-logic unit test loads without a live DB — the
// table objects are only passed through to the mocked `queryById`.
vi.mock('@propertypro/db', () => ({
  units: { __table: 'units' },
  documents: { __table: 'documents' },
}));

import {
  assertDocumentInCommunity,
  assertUnitInCommunity,
} from '@/lib/services/scoped-fk-validators';

function makeScoped(rowsById: Record<number, unknown>): unknown {
  return {
    queryById: vi.fn(async (_table: unknown, id: number) => rowsById[id] ?? null),
  };
}

describe('scoped-fk-validators', () => {
  describe('assertUnitInCommunity', () => {
    it('returns silently for null/undefined ids (optional unit)', async () => {
      const scoped = makeScoped({});
      await expect(
        assertUnitInCommunity(scoped as never, null),
      ).resolves.toBeUndefined();
      await expect(
        assertUnitInCommunity(scoped as never, undefined),
      ).resolves.toBeUndefined();
    });

    it('passes when the unit exists in the active community', async () => {
      const scoped = makeScoped({ 17: { id: 17 } });
      await expect(
        assertUnitInCommunity(scoped as never, 17),
      ).resolves.toBeUndefined();
    });

    it('throws ValidationError when the unit does not exist in the active community', async () => {
      const scoped = makeScoped({});
      await expect(
        assertUnitInCommunity(scoped as never, 17),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('assertDocumentInCommunity', () => {
    it('returns silently for null/undefined ids', async () => {
      const scoped = makeScoped({});
      await expect(
        assertDocumentInCommunity(scoped as never, null),
      ).resolves.toBeUndefined();
    });

    it('passes when the document exists in the active community', async () => {
      const scoped = makeScoped({ 99: { id: 99 } });
      await expect(
        assertDocumentInCommunity(scoped as never, 99),
      ).resolves.toBeUndefined();
    });

    it('throws ValidationError when the document does not exist in the active community', async () => {
      const scoped = makeScoped({});
      await expect(
        assertDocumentInCommunity(scoped as never, 99),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });
});
