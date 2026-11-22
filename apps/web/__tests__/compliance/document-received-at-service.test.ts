/**
 * `documents.received_at` is written once (security review of H-2): the date
 * decides whether a posting was on time, so re-linking a file or re-recording
 * minutes must not move it.
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
  eq: (left: unknown, right: unknown) => ({ type: 'eq', left, right }),
  isNull: (value: unknown) => ({ type: 'isNull', value }),
}));

import { setDocumentReceivedAt } from '@/lib/services/document-received-at-service';

const DATE = new Date('2026-11-03T23:59:59.999Z');

function scoped({ updated, existing }: { updated: unknown[]; existing: unknown[] }) {
  const update = vi.fn().mockResolvedValue(updated);
  createScopedClientMock.mockReturnValue({ update, selectFrom: vi.fn().mockResolvedValue(existing) });
  return { update };
}

describe('setDocumentReceivedAt', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes only where no date is recorded yet', async () => {
    const { update } = scoped({ updated: [{ id: 5 }], existing: [] });
    expect(await setDocumentReceivedAt(42, 5, DATE)).toEqual({ written: true, receivedAt: DATE });
    expect(update).toHaveBeenCalledWith(
      documentsTableMock,
      { receivedAt: DATE },
      { type: 'and', parts: [expect.objectContaining({ type: 'eq' }), { type: 'isNull', value: documentsTableMock.receivedAt }] },
    );
  });

  it('keeps and reports a date already recorded', async () => {
    const existing = new Date('2026-10-01T12:00:00.000Z');
    scoped({ updated: [], existing: [{ id: 5, receivedAt: existing }] });
    expect(await setDocumentReceivedAt(42, 5, DATE)).toEqual({ written: false, receivedAt: existing });
  });

  it('returns null for a document not in this community', async () => {
    scoped({ updated: [], existing: [] });
    expect(await setDocumentReceivedAt(42, 5, DATE)).toBeNull();
  });
});
