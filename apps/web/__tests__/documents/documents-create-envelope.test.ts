/**
 * Pins the documents POST `envelope` schema against what the upload service
 * can actually emit. The runner validates siblings AFTER the handler returns —
 * after `createUploadedDocument` has committed the row — so a warning this
 * schema rejects would turn a successful upload into a 500 and a client retry
 * into a duplicate document. The schema must stay at least as loose as
 * `DocumentMutationWarning`.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@propertypro/db', () => ({
  createPresignedDownloadUrl: vi.fn(),
  createScopedClient: vi.fn(),
  documents: {},
  logAuditEvent: vi.fn(),
}));
vi.mock('@/lib/workers/pdf-extraction', () => ({ queuePdfExtraction: vi.fn() }));
vi.mock('@/lib/services/notification-service', () => ({
  createNotificationsForEvent: vi.fn(),
  queueNotificationDetailed: vi.fn(),
}));

import type { DocumentMutationWarning } from '@/lib/documents/types';
import { DOCUMENT_NOTIFICATION_WARNING } from '@/lib/documents/create-uploaded-document';
import { documentsCreateContract } from '@/app/api/v1/documents/contract';

const declared = documentsCreateContract.envelope;
if (!declared) throw new Error('documents POST contract must declare an envelope');
const envelope = declared;

describe('documents POST envelope schema', () => {
  it('accepts every warning the upload service emits', () => {
    const parsed = envelope.safeParse({ warnings: [DOCUMENT_NOTIFICATION_WARNING] });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ warnings: [DOCUMENT_NOTIFICATION_WARNING] });
  });

  it('accepts any DocumentMutationWarning, not just today’s codes', () => {
    const arbitrary: DocumentMutationWarning = { code: 'some_future_code', message: '' };
    expect(envelope.safeParse({ warnings: [arbitrary] }).success).toBe(true);
  });
});
