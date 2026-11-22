/**
 * `documents.received_at` only ever moves EARLIER (reviews of H-2): it decides
 * whether a posting was on time, and a later date is the only direction that
 * could turn a late posting into an on-time one. A first date is written; an
 * earlier one corrects it (minutes uploaded today, recorded as approved six
 * weeks ago); a later one is kept out and reported, never dropped silently.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createScopedClientMock, documentsTableMock } = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  documentsTableMock: { id: Symbol('documents.id'), receivedAt: Symbol('documents.receivedAt') },
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  documents: documentsTableMock,
}));
vi.mock('@propertypro/db/filters', () => ({
  and: (...parts: unknown[]) => ({ type: 'and', parts }),
  or: (...parts: unknown[]) => ({ type: 'or', parts }),
  eq: (left: unknown, right: unknown) => ({ type: 'eq', left, right }),
  gt: (left: unknown, right: unknown) => ({ type: 'gt', left, right }),
  isNull: (value: unknown) => ({ type: 'isNull', value }),
}));

import { setDocumentReceivedAt } from '@/lib/services/document-received-at-service';

const DATE = new Date('2026-11-03T23:59:59.999Z');

function scoped({ updated, stored }: { updated: unknown[]; stored: Array<Date | null> | null }) {
  const update = vi.fn().mockResolvedValue(updated);
  let reads = 0;
  const selectFrom = vi.fn(async () => {
    if (stored === null) return [];
    const value = stored[Math.min(reads, stored.length - 1)];
    reads += 1;
    return [{ id: 5, receivedAt: value }];
  });
  createScopedClientMock.mockReturnValue({ update, selectFrom });
  return { update };
}

describe('setDocumentReceivedAt', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes only where no date is recorded or the recorded one is LATER', async () => {
    const { update } = scoped({ updated: [{ id: 5 }], stored: [null] });
    expect(await setDocumentReceivedAt(42, 5, DATE)).toEqual({ written: true, previous: null, receivedAt: DATE });
    expect(update).toHaveBeenCalledWith(documentsTableMock, { receivedAt: DATE }, {
      type: 'and',
      parts: [
        expect.objectContaining({ type: 'eq' }),
        {
          type: 'or',
          parts: [
            { type: 'isNull', value: documentsTableMock.receivedAt },
            { type: 'gt', left: documentsTableMock.receivedAt, right: DATE },
          ],
        },
      ],
    });
  });

  it('corrects a recorded date to an earlier one, reporting what it replaced', async () => {
    const later = new Date('2026-11-20T12:00:00.000Z');
    scoped({ updated: [{ id: 5 }], stored: [later] });
    expect(await setDocumentReceivedAt(42, 5, DATE)).toEqual({ written: true, previous: later, receivedAt: DATE });
  });

  it('keeps an earlier recorded date and reports it, so the caller can say so', async () => {
    const earlier = new Date('2026-10-01T12:00:00.000Z');
    scoped({ updated: [], stored: [earlier] });
    expect(await setDocumentReceivedAt(42, 5, DATE)).toEqual({
      written: false,
      previous: earlier,
      receivedAt: earlier,
    });
  });

  it('returns null for a document not in this community, writing nothing', async () => {
    const { update } = scoped({ updated: [], stored: null });
    expect(await setDocumentReceivedAt(42, 5, DATE)).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});
