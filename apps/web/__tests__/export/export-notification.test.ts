/**
 * Tests for the export-ready notification.
 *
 * The behaviours pinned here are the ones whose failure is silent:
 *   1. A mail failure must NOT propagate — the archive is already built and
 *      downloadable, and throwing would flip a finished job to `failed`.
 *   2. Warnings must reach the email. They are required in three places, and
 *      this is the one a board member is most likely to actually read.
 *   3. A purged requester (`requestedBy: null`) must not crash the worker.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-07.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createUnscopedClientMock, sendEmailMock } = vi.hoisted(() => ({
  createUnscopedClientMock: vi.fn(),
  sendEmailMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  communities: { id: 'communities.id', name: 'communities.name' },
  users: { id: 'users.id', email: 'users.email', fullName: 'users.full_name' },
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

vi.mock('@propertypro/email', () => ({
  sendEmail: sendEmailMock,
  CommunityExportReadyEmail: function CommunityExportReadyEmail() {
    return null;
  },
}));

const { sendExportReadyEmail, summarizeWarnings } = await import(
  '@/lib/services/export/export-notification'
);

/** Serves `selectResults` in call order: requester row, then community row. */
function buildDb(selectResults: unknown[][]) {
  const queue = [...selectResults];
  return {
    select: vi.fn(() => {
      const rows = queue.shift() ?? [];
      const chain: Record<string, unknown> = {};
      chain.from = vi.fn(() => chain);
      chain.where = vi.fn(() => chain);
      chain.limit = vi.fn(() => Promise.resolve(rows));
      return chain;
    }),
  };
}

const JOB = {
  id: 1,
  communityId: 42,
  requestedBy: 'user-1',
  manifest: {},
  partCount: 1,
  totalBytes: 1024,
  expiresAt: new Date('2026-08-24T00:00:00Z'),
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  sendEmailMock.mockResolvedValue(undefined);
  createUnscopedClientMock.mockReturnValue(
    buildDb([[{ email: 'board@example.com', fullName: 'Dana' }], [{ name: 'Sunset Condos' }]]),
  );
});

describe('summarizeWarnings', () => {
  it('returns nothing for a clean manifest', () => {
    expect(summarizeWarnings({})).toEqual([]);
    expect(summarizeWarnings({ warnings: [] })).toEqual([]);
  });

  it('GROUPS missing document files into one line rather than listing each', () => {
    // Thirty individual lines would read as noise; the reader would learn less.
    const warnings = Array.from({ length: 30 }, (_, i) => ({
      code: 'DOCUMENT_FILE_MISSING',
      detail: `document ${i}: not found`,
      documentId: i,
    }));

    const lines = summarizeWarnings({ warnings });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('30 document files');
    // The rows are still in the export — saying otherwise would be wrong.
    expect(lines[0]).toContain('still included');
  });

  it('names each failed table, and caps the enumeration', () => {
    const warnings = Array.from({ length: 8 }, (_, i) => ({
      code: 'TABLE_READ_FAILED',
      detail: `table_${i}: boom`,
    }));

    const lines = summarizeWarnings({ warnings });

    expect(lines).toHaveLength(6); // 5 named + 1 "and N more"
    expect(lines[0]).toContain('table_0');
    expect(lines[5]).toContain('3 more');
  });

  it('passes through a warning code it does not recognise', () => {
    // A future warning code must not vanish from the email just because this
    // function predates it.
    const lines = summarizeWarnings({
      warnings: [{ code: 'SOMETHING_NEW', detail: 'an unfamiliar problem' }],
    });
    expect(lines).toEqual(['an unfamiliar problem']);
  });
});

describe('sendExportReadyEmail', () => {
  it('sends a TRANSACTIONAL email to the requester', async () => {
    const result = await sendExportReadyEmail(JOB);

    expect(result.sent).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledOnce();
    const call = sendEmailMock.mock.calls[0]![0];
    expect(call.to).toBe('board@example.com');
    // Not 'non-transactional': buildHeaders would demand an unsubscribe URL, and
    // an unsubscribe link on "the thing you asked for is ready" is wrong.
    expect(call.category).toBe('transactional');
    expect(call.subject).toContain('Sunset Condos');
  });

  it('links to the APP, never to a signed storage URL', async () => {
    await sendExportReadyEmail(JOB);

    const props = sendEmailMock.mock.calls[0]![0].react.props;
    expect(props.downloadUrl).toContain('/settings');
    expect(props.downloadUrl).not.toContain('token=');
    expect(props.downloadUrl).not.toContain('supabase');
  });

  it('carries the manifest warnings into the email props', async () => {
    await sendExportReadyEmail({
      ...JOB,
      manifest: {
        warnings: [{ code: 'DOCUMENT_FILE_MISSING', detail: 'document 5: gone', documentId: 5 }],
      },
    } as never);

    const props = sendEmailMock.mock.calls[0]![0].react.props;
    expect(props.warnings).toHaveLength(1);
    expect(props.warnings[0]).toContain('1 document file');
  });

  it('does NOT throw when the mail provider fails', async () => {
    // The archive already exists and is downloadable. Throwing here would send
    // the worker back to rebuild an export that is already finished.
    sendEmailMock.mockRejectedValueOnce(new Error('resend is down'));

    const result = await sendExportReadyEmail(JOB);

    expect(result.sent).toBe(false);
    expect(result.reason).toContain('resend is down');
  });

  it('skips cleanly when the requester was purged', async () => {
    const result = await sendExportReadyEmail({ ...JOB, requestedBy: null } as never);

    expect(result.sent).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('skips cleanly when the requester row has no email', async () => {
    createUnscopedClientMock.mockReturnValue(buildDb([[], []]));

    const result = await sendExportReadyEmail(JOB);

    expect(result.sent).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('falls back to a generic community name rather than failing', async () => {
    createUnscopedClientMock.mockReturnValue(
      buildDb([[{ email: 'a@b.com', fullName: 'Dana' }], []]),
    );

    const result = await sendExportReadyEmail(JOB);

    expect(result.sent).toBe(true);
    expect(sendEmailMock.mock.calls[0]![0].subject).toContain('Your Community');
  });
});
