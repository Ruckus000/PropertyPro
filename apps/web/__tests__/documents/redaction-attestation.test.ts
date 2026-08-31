/**
 * Redaction attestation on document upload (§718.111(12)(c)).
 *
 * The point of the attestation is evidentiary, so the tests that matter are the
 * ones about what gets RECORDED and when the gate refuses:
 *
 *   1. A sensitive category with no attestation is refused BEFORE the row is
 *      created — an unredacted record that reaches the portal and is then
 *      deleted was still published.
 *   2. An unrecognised category is treated as sensitive. Otherwise renaming
 *      "Financial Records" silently switches the check off.
 *   3. Low-risk categories are NOT prompted. Prompting on the declaration is how
 *      you train a board to click through without reading.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-02.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { logAuditEventMock, getDocumentCategoryNamesMock } = vi.hoisted(() => ({
  logAuditEventMock: vi.fn(),
  getDocumentCategoryNamesMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({ logAuditEvent: logAuditEventMock }));
vi.mock('@/lib/services/document-category-service', () => ({
  getDocumentCategoryNames: getDocumentCategoryNamesMock,
}));

const {
  REDACTION_ATTESTATION_TEXT,
  categoryRequiresRedactionAttestation,
  enforceRedactionAttestation,
} = await import('@/lib/documents/redaction-attestation');

/** Resolve categoryId 1 to the given display name. */
function categoryNamed(name: string | null) {
  getDocumentCategoryNamesMock.mockResolvedValue(
    name === null ? new Map() : new Map([[1, name]]),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  logAuditEventMock.mockResolvedValue(undefined);
});

describe('categoryRequiresRedactionAttestation', () => {
  it.each([
    'Financial Records',
    'Meeting Minutes',
    'Maintenance Records',
    'Lease Documents',
    'Move In/Out Documents',
    'Elections',
  ])('requires an attestation for %s', async (name) => {
    categoryNamed(name);
    expect(await categoryRequiresRedactionAttestation(42, 1)).toBe(true);
  });

  it.each(['Declaration', 'Rules', 'Community Handbook', 'Announcements'])(
    'does NOT prompt for %s',
    async (name) => {
      // Deliberate: a prompt on a public governing document is noise, and noise
      // is what teaches people to click through the prompt that matters.
      categoryNamed(name);
      expect(await categoryRequiresRedactionAttestation(42, 1)).toBe(false);
    },
  );

  it('treats an UNRECOGNISED category name as sensitive', async () => {
    categoryNamed('Board Packets 2026');
    expect(await categoryRequiresRedactionAttestation(42, 1)).toBe(true);
  });

  it('treats a category id that resolves to no row as sensitive', async () => {
    // Fail closed. A missing category is not evidence a document is safe.
    categoryNamed(null);
    expect(await categoryRequiresRedactionAttestation(42, 1)).toBe(true);
  });
});

describe('enforceRedactionAttestation', () => {
  const base = { communityId: 42, categoryId: 1, userId: 'user-1', title: 'March minutes' };

  it('throws a 400 for a sensitive category with no attestation', async () => {
    categoryNamed('Meeting Minutes');

    await expect(
      enforceRedactionAttestation({ ...base, attested: undefined }),
    ).rejects.toThrow(/redacted/i);
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it.each([false, undefined])('rejects attested=%o', async (attested) => {
    categoryNamed('Financial Records');
    await expect(enforceRedactionAttestation({ ...base, attested })).rejects.toThrow();
  });

  it('records actor, statute and the attestation TEXT when attested', async () => {
    // Recording the wording verbatim means a later copy change does not rewrite
    // what past uploaders actually agreed to.
    categoryNamed('Financial Records');

    await enforceRedactionAttestation({ ...base, attested: true });

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        communityId: 42,
        resourceType: 'document_redaction_attestation',
        newValues: expect.objectContaining({
          attested: true,
          attestationText: REDACTION_ATTESTATION_TEXT,
          statute: '718.111(12)(c)',
          documentTitle: 'March minutes',
        }),
      }),
    );
  });

  it('does nothing at all for a non-sensitive category', async () => {
    categoryNamed('Declaration');

    await enforceRedactionAttestation({ ...base, attested: undefined });

    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('cites the statute in the attestation text', async () => {
    expect(REDACTION_ATTESTATION_TEXT).toContain('718.111(12)(c)');
  });
});
