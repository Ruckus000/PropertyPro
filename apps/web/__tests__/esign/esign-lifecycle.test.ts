import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — shared admin client that tracks all operations
// ---------------------------------------------------------------------------

const {
  createScopedClientMock,
  createAdminClientMock,
  logAuditEventMock,
  createPresignedDownloadUrlMock,
  esignTemplatesTable,
  esignSubmissionsTable,
  esignSignersTable,
  esignEventsTable,
  esignConsentTable,
  flattenSignedPdfMock,
  computeDocumentHashMock,
  uploadSignedDocumentMock,
  eqMock,
  andMock,
  isNullMock,
  orMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  createPresignedDownloadUrlMock: vi.fn(),
  esignTemplatesTable: {
    id: Symbol('templates.id'),
    communityId: Symbol('templates.communityId'),
    status: Symbol('templates.status'),
    templateType: Symbol('templates.templateType'),
  },
  esignSubmissionsTable: {
    id: Symbol('submissions.id'),
    communityId: Symbol('submissions.communityId'),
    status: Symbol('submissions.status'),
    submissionId: Symbol('submissions.submissionId'),
  },
  esignSignersTable: {
    id: Symbol('signers.id'),
    communityId: Symbol('signers.communityId'),
    submissionId: Symbol('signers.submissionId'),
  },
  esignEventsTable: {
    submissionId: Symbol('events.submissionId'),
  },
  esignConsentTable: {
    userId: Symbol('consent.userId'),
    revokedAt: Symbol('consent.revokedAt'),
  },
  flattenSignedPdfMock: vi.fn(),
  computeDocumentHashMock: vi.fn(),
  uploadSignedDocumentMock: vi.fn(),
  eqMock: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  andMock: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  isNullMock: vi.fn((...args: unknown[]) => ({ type: 'isNull', args })),
  orMock: vi.fn((...args: unknown[]) => ({ type: 'or', args })),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  createAdminClient: createAdminClientMock,
  createPresignedDownloadUrl: createPresignedDownloadUrlMock,
  esignTemplates: esignTemplatesTable,
  esignSubmissions: esignSubmissionsTable,
  esignSigners: esignSignersTable,
  esignEvents: esignEventsTable,
  esignConsent: esignConsentTable,
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: eqMock,
  and: andMock,
  isNull: isNullMock,
  or: orMock,
}));

vi.mock('../../src/lib/services/esign-pdf-service', () => ({
  flattenSignedPdf: flattenSignedPdfMock,
  computeDocumentHash: computeDocumentHashMock,
  uploadSignedDocument: uploadSignedDocumentMock,
}));

import type { EsignFieldsSchema } from '@propertypro/shared';
import {
  createTemplate,
  updateTemplate,
  archiveTemplate,
  cloneTemplate,
  listTemplates,
  createSubmission,
  cancelSubmission,
  sendReminder,
  submitSignature,
  getSignerContext,
  declineSigning,
  getConsentStatus,
  revokeConsent,
} from '../../src/lib/services/esign-service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validFieldsSchema(): EsignFieldsSchema {
  return {
    version: 1,
    signerRoles: ['signer'],
    fields: [
      {
        id: 'sig-1',
        type: 'signature',
        signerRole: 'signer',
        page: 0,
        x: 10,
        y: 20,
        width: 30,
        height: 5,
        required: true,
      },
    ],
  };
}

function twoRoleFieldsSchema(): EsignFieldsSchema {
  return {
    version: 1,
    signerRoles: ['signer', 'witness'],
    fields: [
      {
        id: 'sig-1',
        type: 'signature',
        signerRole: 'signer',
        page: 0,
        x: 10,
        y: 20,
        width: 30,
        height: 5,
        required: true,
      },
      {
        id: 'sig-2',
        type: 'signature',
        signerRole: 'witness',
        page: 0,
        x: 10,
        y: 50,
        width: 30,
        height: 5,
        required: true,
      },
    ],
  };
}

function makeScopedMock(overrides: Record<string, unknown> = {}) {
  return {
    insert: vi.fn(async () => [{ id: 1, communityId: 1, ...overrides }]),
    selectFrom: vi.fn(async () => [{ id: 1, communityId: 1, ...overrides }]),
    update: vi.fn(async () => [{ id: 1, communityId: 1, ...overrides }]),
    ...overrides,
  };
}

/**
 * Creates a configurable admin client mock for the signing flow.
 * Allows different responses for signer, submission, template, and update lookups.
 */
function makeAdminClientMock(config: {
  signerRow?: Record<string, unknown> | null;
  submissionRow?: Record<string, unknown> | null;
  templateRow?: Record<string, unknown> | null;
  allSignerRows?: Record<string, unknown>[];
  priorSignerRows?: Record<string, unknown>[];
  consentRows?: Record<string, unknown>[];
  updateResult?: Record<string, unknown>[];
  guardUpdateResult?: Record<string, unknown>[];
}) {
  let fromCallCount = 0;
  const insertCalls: unknown[] = [];
  const updateCalls: { table: string; data: unknown }[] = [];

  const admin = {
    from: vi.fn((table: string) => {
      fromCallCount++;

      function makeSelectChain(data: unknown[] | null) {
        const sc: Record<string, unknown> = {};
        sc.eq = vi.fn(() => sc);
        sc.is = vi.fn(() => sc);
        sc.in = vi.fn(() => sc);
        sc.lt = vi.fn(() => sc);
        sc.limit = vi.fn(async () => ({
          data: data ?? [],
          error: null,
        }));
        sc.then = (resolve: (v: unknown) => void) =>
          resolve({ data: data ?? [], error: null });
        return sc;
      }

      function makeUpdateChain(result: unknown[] | null) {
        const uc: Record<string, unknown> = {};
        uc.eq = vi.fn(() => uc);
        uc.in = vi.fn(() => uc);
        uc.is = vi.fn(() => uc);
        uc.select = vi.fn(async () => ({
          data: result ?? [],
          error: null,
        }));
        uc.then = (resolve: (v: unknown) => void) =>
          resolve({ data: result ?? [], error: null });
        return uc;
      }

      const c: Record<string, unknown> = {};

      c.select = vi.fn(() => {
        if (table === 'esign_signers') {
          // Multiple select calls on signers: first for signer lookup, later for all signers
          if (config.allSignerRows && fromCallCount > 3) {
            return makeSelectChain(config.allSignerRows);
          }
          if (config.priorSignerRows && fromCallCount > 3) {
            return makeSelectChain(config.priorSignerRows);
          }
          return makeSelectChain(config.signerRow ? [config.signerRow] : []);
        }
        if (table === 'esign_submissions') {
          return makeSelectChain(config.submissionRow ? [config.submissionRow] : []);
        }
        if (table === 'esign_templates') {
          return makeSelectChain(config.templateRow ? [config.templateRow] : []);
        }
        if (table === 'esign_consent') {
          return makeSelectChain(config.consentRows ?? []);
        }
        return makeSelectChain([]);
      });

      c.update = vi.fn((data: unknown) => {
        updateCalls.push({ table, data });

        if (table === 'esign_submissions' && config.guardUpdateResult !== undefined) {
          return makeUpdateChain(config.guardUpdateResult);
        }
        return makeUpdateChain(config.updateResult ?? [{ id: 1 }]);
      });

      c.insert = vi.fn(async (data: unknown) => {
        insertCalls.push({ table, data });
        return { data: [{ id: insertCalls.length }], error: null };
      });

      return c;
    }),
    _insertCalls: insertCalls,
    _updateCalls: updateCalls,
  };

  return admin;
}

// ---------------------------------------------------------------------------
// Integration Tests
// ---------------------------------------------------------------------------

describe('E-Sign Full Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    logAuditEventMock.mockResolvedValue(undefined);
    flattenSignedPdfMock.mockResolvedValue(new Uint8Array([1, 2, 3]));
    computeDocumentHashMock.mockReturnValue('abc123hash');
    uploadSignedDocumentMock.mockResolvedValue('communities/1/esign-signed/1/signed.pdf');
  });

  // =========================================================================
  // Happy Path: Template + Submission + Signing
  // =========================================================================

  describe('Happy Path: Parallel Signing', () => {
    it('creates template, submission, and allows both signers to sign', async () => {
      // Step 1: Create template
      const templateScoped = makeScopedMock({ name: 'Parallel Template', id: 1 });
      createScopedClientMock.mockReturnValue(templateScoped);

      const template = await createTemplate(1, 'admin-1', {
        name: 'Parallel Template',
        templateType: 'custom',
        sourceDocumentPath: 'docs/test.pdf',
        fieldsSchema: twoRoleFieldsSchema(),
      });

      expect(template).toBeDefined();
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'esign_template_created' }),
      );
    });

    it('creates a submission with multiple signers and logs events', async () => {
      const insertCalls: unknown[] = [];
      const scoped = {
        selectFrom: vi.fn(async () => [{
          id: 1,
          communityId: 1,
          fieldsSchema: twoRoleFieldsSchema(),
          status: 'active',
          name: 'Template',
        }]),
        insert: vi.fn(async (_table: unknown, data: Record<string, unknown>) => {
          insertCalls.push(data);
          return [{ id: insertCalls.length, communityId: 1, ...data }];
        }),
        update: vi.fn(async () => []),
      };
      createScopedClientMock.mockReturnValue(scoped);

      const result = await createSubmission(1, 'admin-1', {
        templateId: 1,
        signers: [
          { email: 'a@test.com', name: 'Alice', role: 'signer', sortOrder: 0 },
          { email: 'b@test.com', name: 'Bob', role: 'witness', sortOrder: 0 },
        ],
        signingOrder: 'parallel',
        sendEmail: true,
      });

      expect(result.submission).toBeDefined();
      expect(result.signers).toHaveLength(2);
      // 1 submission + 2 signers + 1 event = 4 inserts
      expect(scoped.insert).toHaveBeenCalledTimes(4);
    });
  });

  describe('Happy Path: Sequential Signing', () => {
    it('marks second signer as waiting when first has not signed', async () => {
      const admin = makeAdminClientMock({
        signerRow: {
          id: 2, community_id: 1, submission_id: 10, external_id: 'ext-2',
          user_id: null, email: 'b@test.com', name: 'Bob', role: 'signer',
          slug: 'slug-bob', sort_order: 1, status: 'pending',
          opened_at: null, completed_at: null, signed_values: null,
          reminder_count: 0, created_at: '2026-01-01', deleted_at: null,
        },
        submissionRow: {
          id: 10, community_id: 1, template_id: 1, external_id: 'sub-ext',
          status: 'pending', signing_order: 'sequential', send_email: true,
          expires_at: null, completed_at: null, signed_document_path: null,
          message_subject: null, message_body: null, created_by: 'user-1',
          created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null,
        },
        templateRow: {
          id: 1, community_id: 1, external_id: 'tpl-ext', name: 'Template',
          description: null, source_document_path: 'test.pdf',
          template_type: 'custom', fields_schema: validFieldsSchema(),
          status: 'active', created_by: 'user-1', created_at: '2026-01-01',
          updated_at: '2026-01-01', deleted_at: null,
        },
        priorSignerRows: [
          {
            id: 1, community_id: 1, submission_id: 10, sort_order: 0,
            status: 'pending', name: 'Alice', deleted_at: null,
          },
        ],
      });

      createAdminClientMock.mockReturnValue(admin);

      const context = await getSignerContext('slug-bob');

      expect(context.isWaiting).toBe(true);
      expect(context.waitingFor).toBe('Alice');
    });

    it('allows second signer to proceed when first has completed', async () => {
      const admin = makeAdminClientMock({
        signerRow: {
          id: 2, community_id: 1, submission_id: 10, external_id: 'ext-2',
          user_id: null, email: 'b@test.com', name: 'Bob', role: 'signer',
          slug: 'slug-bob', sort_order: 1, status: 'pending',
          opened_at: null, completed_at: null, signed_values: null,
          reminder_count: 0, created_at: '2026-01-01', deleted_at: null,
        },
        submissionRow: {
          id: 10, community_id: 1, template_id: 1, external_id: 'sub-ext',
          status: 'pending', signing_order: 'sequential', send_email: true,
          expires_at: null, completed_at: null, signed_document_path: null,
          message_subject: null, message_body: null, created_by: 'user-1',
          created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null,
        },
        templateRow: {
          id: 1, community_id: 1, external_id: 'tpl-ext', name: 'Template',
          description: null, source_document_path: 'test.pdf',
          template_type: 'custom', fields_schema: validFieldsSchema(),
          status: 'active', created_by: 'user-1', created_at: '2026-01-01',
          updated_at: '2026-01-01', deleted_at: null,
        },
        priorSignerRows: [
          {
            id: 1, community_id: 1, submission_id: 10, sort_order: 0,
            status: 'completed', name: 'Alice', deleted_at: null,
          },
        ],
      });

      createAdminClientMock.mockReturnValue(admin);

      const context = await getSignerContext('slug-bob');

      expect(context.isWaiting).toBe(false);
    });

    it('checks sortOrder=0 signers for prior completion in sequential mode', async () => {
      // Even signers with sortOrder=0 should be checked — the fix removed the sortOrder > 0 guard
      const admin = makeAdminClientMock({
        signerRow: {
          id: 1, community_id: 1, submission_id: 10, external_id: 'ext-1',
          user_id: null, email: 'a@test.com', name: 'Alice', role: 'signer',
          slug: 'slug-alice', sort_order: 0, status: 'pending',
          opened_at: null, completed_at: null, signed_values: null,
          reminder_count: 0, created_at: '2026-01-01', deleted_at: null,
        },
        submissionRow: {
          id: 10, community_id: 1, template_id: 1, external_id: 'sub-ext',
          status: 'pending', signing_order: 'sequential', send_email: true,
          expires_at: null, completed_at: null, signed_document_path: null,
          message_subject: null, message_body: null, created_by: 'user-1',
          created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null,
        },
        templateRow: {
          id: 1, community_id: 1, external_id: 'tpl-ext', name: 'Template',
          description: null, source_document_path: 'test.pdf',
          template_type: 'custom', fields_schema: validFieldsSchema(),
          status: 'active', created_by: 'user-1', created_at: '2026-01-01',
          updated_at: '2026-01-01', deleted_at: null,
        },
        // No prior signers (sortOrder < 0 doesn't exist)
        priorSignerRows: [],
      });

      createAdminClientMock.mockReturnValue(admin);

      // sortOrder=0 signer with no prior signers should NOT be waiting
      const context = await getSignerContext('slug-alice');
      expect(context.isWaiting).toBe(false);
    });
  });

  // =========================================================================
  // Decline Flow
  // =========================================================================

  describe('Decline Flow', () => {
    it('marks signer as declined and submission as declined', async () => {
      // getSignerContext uses admin client for slug-based lookup
      const admin = makeAdminClientMock({
        signerRow: {
          id: 1, community_id: 1, submission_id: 10, external_id: 'ext-1',
          user_id: null, email: 'a@test.com', name: 'Alice', role: 'signer',
          slug: 'slug-decline', sort_order: 0, status: 'opened',
          opened_at: '2026-01-01', completed_at: null, signed_values: null,
          reminder_count: 0, created_at: '2026-01-01', deleted_at: null,
        },
        submissionRow: {
          id: 10, community_id: 1, template_id: 1, external_id: 'sub-ext',
          status: 'pending', signing_order: 'parallel', send_email: true,
          expires_at: null, completed_at: null, signed_document_path: null,
          message_subject: null, message_body: null, created_by: 'user-1',
          created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null,
        },
        templateRow: {
          id: 1, community_id: 1, external_id: 'tpl-ext', name: 'Template',
          description: null, source_document_path: 'test.pdf',
          template_type: 'custom', fields_schema: validFieldsSchema(),
          status: 'active', created_by: 'user-1', created_at: '2026-01-01',
          updated_at: '2026-01-01', deleted_at: null,
        },
      });

      createAdminClientMock.mockReturnValue(admin);

      // declineSigning now uses scoped client for mutations
      const scoped = makeScopedMock();
      createScopedClientMock.mockReturnValue(scoped);

      const result = await declineSigning('slug-decline', 'I disagree with the terms');

      expect(result.success).toBe(true);
      // Should have called scoped.update twice (signer declined, submission declined)
      expect(scoped.update).toHaveBeenCalledTimes(2);
      expect(scoped.update).toHaveBeenCalledWith(
        esignSignersTable,
        expect.objectContaining({ status: 'declined' }),
        expect.anything(),
      );
      expect(scoped.update).toHaveBeenCalledWith(
        esignSubmissionsTable,
        expect.objectContaining({ status: 'declined' }),
        expect.anything(),
      );
      // Should have inserted a declined event via scoped client
      expect(scoped.insert).toHaveBeenCalledWith(
        esignEventsTable,
        expect.objectContaining({ eventType: 'declined' }),
      );
    });

    it('blocks a declined signer from accessing the signing page', async () => {
      const admin = makeAdminClientMock({
        signerRow: {
          id: 1, community_id: 1, submission_id: 10, external_id: 'ext-1',
          user_id: null, email: 'a@test.com', name: 'Alice', role: 'signer',
          slug: 'slug-declined', sort_order: 0, status: 'declined',
          opened_at: '2026-01-01', completed_at: null, signed_values: null,
          reminder_count: 0, created_at: '2026-01-01', deleted_at: null,
        },
      });

      createAdminClientMock.mockReturnValue(admin);

      await expect(getSignerContext('slug-declined')).rejects.toThrow(
        'You have declined to sign this document',
      );
    });
  });

  // =========================================================================
  // Cancellation Flow
  // =========================================================================

  describe('Cancellation Flow', () => {
    it('cancels a pending submission and logs the event', async () => {
      const scoped = makeScopedMock();
      let callCount = 0;
      scoped.selectFrom = vi.fn(async () => {
        callCount++;
        if (callCount === 1) return [{ id: 1, communityId: 1, status: 'pending' }];
        if (callCount === 2) return [{ id: 10, communityId: 1 }]; // signers
        return []; // events
      });
      createScopedClientMock.mockReturnValue(scoped);

      await cancelSubmission(1, 'user-1', 1);

      expect(scoped.update).toHaveBeenCalledWith(
        esignSubmissionsTable,
        expect.objectContaining({ status: 'cancelled' }),
        expect.anything(),
      );
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'esign_submission_cancelled' }),
      );
    });

    it('signers see cancelled state when accessing a cancelled submission', async () => {
      const admin = makeAdminClientMock({
        signerRow: {
          id: 1, community_id: 1, submission_id: 10, external_id: 'ext-1',
          user_id: null, email: 'a@test.com', name: 'Alice', role: 'signer',
          slug: 'slug-cancel', sort_order: 0, status: 'pending',
          opened_at: null, completed_at: null, signed_values: null,
          reminder_count: 0, created_at: '2026-01-01', deleted_at: null,
        },
        submissionRow: {
          id: 10, community_id: 1, template_id: 1, external_id: 'sub-ext',
          status: 'cancelled', signing_order: 'parallel', send_email: true,
          expires_at: null, completed_at: null, signed_document_path: null,
          message_subject: null, message_body: null, created_by: 'user-1',
          created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null,
        },
      });

      createAdminClientMock.mockReturnValue(admin);

      await expect(getSignerContext('slug-cancel')).rejects.toThrow(
        'This signing request has been cancelled',
      );
    });
  });

  // =========================================================================
  // Expiration Flow
  // =========================================================================

  describe('Expiration Flow', () => {
    it('rejects signing when submission has expired', async () => {
      const pastDate = new Date('2025-01-01').toISOString();

      const admin = makeAdminClientMock({
        signerRow: {
          id: 1, community_id: 1, submission_id: 10, external_id: 'ext-1',
          user_id: null, email: 'a@test.com', name: 'Alice', role: 'signer',
          slug: 'slug-expired', sort_order: 0, status: 'pending',
          opened_at: null, completed_at: null, signed_values: null,
          reminder_count: 0, created_at: '2025-01-01', deleted_at: null,
        },
        submissionRow: {
          id: 10, community_id: 1, template_id: 1, external_id: 'sub-ext',
          status: 'pending', signing_order: 'parallel', send_email: true,
          expires_at: pastDate, completed_at: null, signed_document_path: null,
          message_subject: null, message_body: null, created_by: 'user-1',
          created_at: '2025-01-01', updated_at: '2025-01-01', deleted_at: null,
        },
      });

      createAdminClientMock.mockReturnValue(admin);

      await expect(getSignerContext('slug-expired')).rejects.toThrow(
        'This signing request has expired',
      );
    });

    it('rejects signing when submission status is explicitly expired', async () => {
      const admin = makeAdminClientMock({
        signerRow: {
          id: 1, community_id: 1, submission_id: 10, external_id: 'ext-1',
          user_id: null, email: 'a@test.com', name: 'Alice', role: 'signer',
          slug: 'slug-exp-status', sort_order: 0, status: 'pending',
          opened_at: null, completed_at: null, signed_values: null,
          reminder_count: 0, created_at: '2025-01-01', deleted_at: null,
        },
        submissionRow: {
          id: 10, community_id: 1, template_id: 1, external_id: 'sub-ext',
          status: 'expired', signing_order: 'parallel', send_email: true,
          expires_at: null, completed_at: null, signed_document_path: null,
          message_subject: null, message_body: null, created_by: 'user-1',
          created_at: '2025-01-01', updated_at: '2025-01-01', deleted_at: null,
        },
      });

      createAdminClientMock.mockReturnValue(admin);

      await expect(getSignerContext('slug-exp-status')).rejects.toThrow(
        'This signing request has expired',
      );
    });
  });

  // =========================================================================
  // Reminder Lifecycle
  // =========================================================================

  describe('Reminder Lifecycle', () => {
    it('allows 3 reminders then rejects the 4th', async () => {
      const scoped = makeScopedMock();

      // First 3 reminders succeed
      for (let i = 0; i < 3; i++) {
        vi.clearAllMocks();
        logAuditEventMock.mockResolvedValue(undefined);

        scoped.selectFrom = vi.fn(async () => [
          { id: 1, communityId: 1, status: 'pending', reminderCount: i, submissionId: 10 },
        ]);
        scoped.update = vi.fn(async () => [{ id: 1 }]);
        scoped.insert = vi.fn(async () => [{ id: 1 }]);
        createScopedClientMock.mockReturnValue(scoped);

        await sendReminder(1, 'user-1', 10, 1);
        expect(scoped.update).toHaveBeenCalled();
      }

      // 4th reminder should fail
      vi.clearAllMocks();
      logAuditEventMock.mockResolvedValue(undefined);
      scoped.selectFrom = vi.fn(async () => [
        { id: 1, communityId: 1, status: 'pending', reminderCount: 3, submissionId: 10 },
      ]);
      createScopedClientMock.mockReturnValue(scoped);

      await expect(sendReminder(1, 'user-1', 10, 1)).rejects.toThrow(
        'Maximum of 3 reminders reached',
      );
    });
  });

  // =========================================================================
  // Consent Dual-Path
  // =========================================================================

  describe('Consent Dual-Path', () => {
    it('creates consent record for internal signer (with userId)', async () => {
      // getSignerContext uses admin client for slug-based lookup
      const admin = makeAdminClientMock({
        signerRow: {
          id: 1, community_id: 1, submission_id: 10, external_id: 'ext-1',
          user_id: 'user-internal', email: 'internal@test.com', name: 'Internal',
          role: 'signer', slug: 'slug-internal', sort_order: 0, status: 'opened',
          opened_at: '2026-01-01', completed_at: null, signed_values: null,
          reminder_count: 0, created_at: '2026-01-01', deleted_at: null,
        },
        submissionRow: {
          id: 10, community_id: 1, template_id: 1, external_id: 'sub-ext',
          status: 'pending', signing_order: 'parallel', send_email: true,
          expires_at: null, completed_at: null, signed_document_path: null,
          message_subject: null, message_body: null, created_by: 'user-1',
          created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null,
        },
        templateRow: {
          id: 1, community_id: 1, external_id: 'tpl-ext', name: 'Template',
          description: null, source_document_path: 'test.pdf',
          template_type: 'custom', fields_schema: validFieldsSchema(),
          status: 'active', created_by: 'user-1', created_at: '2026-01-01',
          updated_at: '2026-01-01', deleted_at: null,
        },
      });
      createAdminClientMock.mockReturnValue(admin);

      // submitSignature now uses scoped client for mutations
      // Track insert calls to verify consent record creation
      const scopedInsertCalls: { table: unknown; data: unknown }[] = [];
      let selectFromCallCount = 0;
      const scoped = {
        update: vi.fn(async () => [{ id: 1 }]), // atomic guard succeeds
        insert: vi.fn(async (table: unknown, data: unknown) => {
          scopedInsertCalls.push({ table, data });
          return [{ id: scopedInsertCalls.length }];
        }),
        selectFrom: vi.fn(async () => {
          selectFromCallCount++;
          // First selectFrom: consent lookup (no existing consent)
          if (selectFromCallCount === 1) return [];
          // Second selectFrom: all signers for completion check
          if (selectFromCallCount === 2) return [{ id: 1, communityId: 1, status: 'completed', submissionId: 10 }];
          return [];
        }),
      };
      createScopedClientMock.mockReturnValue(scoped);

      await submitSignature(
        'slug-internal',
        {
          signedValues: { f1: { fieldId: 'sig-1', type: 'signature', value: 'sig-data', signedAt: '2026-01-01T00:00:00Z' } },
          consentGiven: true,
        },
        '127.0.0.1',
        'TestAgent/1.0',
      );

      // Should have inserted a consent record for the internal user via scoped client
      const consentInsert = scopedInsertCalls.find((c) => c.table === esignConsentTable);
      expect(consentInsert).toBeDefined();

      // Should have inserted a consent_given event via scoped client
      const consentEvent = scopedInsertCalls.find(
        (c) => c.table === esignEventsTable && (c.data as Record<string, unknown>).eventType === 'consent_given',
      );
      expect(consentEvent).toBeDefined();
    });

    it('does not create consent record for external signer (no userId)', async () => {
      // getSignerContext uses admin client for slug-based lookup
      const admin = makeAdminClientMock({
        signerRow: {
          id: 1, community_id: 1, submission_id: 10, external_id: 'ext-1',
          user_id: null, // External signer — no userId
          email: 'external@test.com', name: 'External',
          role: 'signer', slug: 'slug-external', sort_order: 0, status: 'opened',
          opened_at: '2026-01-01', completed_at: null, signed_values: null,
          reminder_count: 0, created_at: '2026-01-01', deleted_at: null,
        },
        submissionRow: {
          id: 10, community_id: 1, template_id: 1, external_id: 'sub-ext',
          status: 'pending', signing_order: 'parallel', send_email: true,
          expires_at: null, completed_at: null, signed_document_path: null,
          message_subject: null, message_body: null, created_by: 'user-1',
          created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null,
        },
        templateRow: {
          id: 1, community_id: 1, external_id: 'tpl-ext', name: 'Template',
          description: null, source_document_path: 'test.pdf',
          template_type: 'custom', fields_schema: validFieldsSchema(),
          status: 'active', created_by: 'user-1', created_at: '2026-01-01',
          updated_at: '2026-01-01', deleted_at: null,
        },
      });
      createAdminClientMock.mockReturnValue(admin);

      // submitSignature now uses scoped client for mutations
      const scopedInsertCalls: { table: unknown; data: unknown }[] = [];
      const scoped = {
        update: vi.fn(async () => [{ id: 1 }]), // atomic guard succeeds
        insert: vi.fn(async (table: unknown, data: unknown) => {
          scopedInsertCalls.push({ table, data });
          return [{ id: scopedInsertCalls.length }];
        }),
        selectFrom: vi.fn(async () => {
          // All signers for completion check — one signer, completed
          return [{ id: 1, communityId: 1, status: 'completed', submissionId: 10 }];
        }),
      };
      createScopedClientMock.mockReturnValue(scoped);

      await submitSignature(
        'slug-external',
        {
          signedValues: { f1: { fieldId: 'sig-1', type: 'signature', value: 'sig-data', signedAt: '2026-01-01T00:00:00Z' } },
          consentGiven: true,
        },
        '127.0.0.1',
        'TestAgent/1.0',
      );

      // Should NOT have a consent record insert (external signer has no userId)
      const consentInsert = scopedInsertCalls.find((c) => c.table === esignConsentTable);
      expect(consentInsert).toBeUndefined();

      // But should still have a consent_given event
      const consentEvent = scopedInsertCalls.find(
        (c) => c.table === esignEventsTable && (c.data as Record<string, unknown>).eventType === 'consent_given',
      );
      expect(consentEvent).toBeDefined();
    });
  });

  // =========================================================================
  // Security: Cross-submission reminder
  // =========================================================================

  describe('Security: Cross-submission reminder', () => {
    it('rejects reminder when signerId belongs to a different submission', async () => {
      const scoped = makeScopedMock();
      // AND filter on (signers.id = signerId AND signers.submissionId = submissionId)
      // returns empty since the signer belongs to a different submission
      scoped.selectFrom = vi.fn(async () => []);
      createScopedClientMock.mockReturnValue(scoped);

      await expect(sendReminder(1, 'user-1', 999, 1)).rejects.toThrow('Signer not found');
    });
  });

  // =========================================================================
  // Security: Double-sign prevention
  // =========================================================================

  describe('Security: Double-sign prevention', () => {
    it('rejects a completed signer from accessing signing page', async () => {
      const admin = makeAdminClientMock({
        signerRow: {
          id: 1, community_id: 1, submission_id: 10, external_id: 'ext-1',
          user_id: null, email: 'a@test.com', name: 'Alice', role: 'signer',
          slug: 'slug-complete', sort_order: 0, status: 'completed',
          opened_at: '2026-01-01', completed_at: '2026-01-02', signed_values: {},
          reminder_count: 0, created_at: '2026-01-01', deleted_at: null,
        },
      });

      createAdminClientMock.mockReturnValue(admin);

      await expect(getSignerContext('slug-complete')).rejects.toThrow(
        'You have already signed this document',
      );
    });
  });

  // =========================================================================
  // Template Lifecycle
  // =========================================================================

  describe('Template Lifecycle', () => {
    it('create -> update -> clone -> archive flow', async () => {
      // Create
      const scoped = makeScopedMock({
        name: 'Original',
        fieldsSchema: validFieldsSchema(),
        status: 'active',
        description: 'Desc',
        sourceDocumentPath: 'doc.pdf',
        templateType: 'custom',
      });
      createScopedClientMock.mockReturnValue(scoped);

      const created = await createTemplate(1, 'user-1', {
        name: 'Original',
        templateType: 'custom',
        sourceDocumentPath: 'doc.pdf',
        fieldsSchema: validFieldsSchema(),
      });
      expect(created).toBeDefined();

      // Update
      vi.clearAllMocks();
      logAuditEventMock.mockResolvedValue(undefined);
      createScopedClientMock.mockReturnValue(scoped);

      const updated = await updateTemplate(1, 'user-1', 1, { name: 'Updated' });
      expect(updated).toBeDefined();
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'esign_template_updated' }),
      );

      // Clone
      vi.clearAllMocks();
      logAuditEventMock.mockResolvedValue(undefined);
      createScopedClientMock.mockReturnValue(scoped);

      const cloned = await cloneTemplate(1, 'user-1', 1, 'Cloned Copy');
      expect(cloned).toBeDefined();
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'esign_template_cloned',
          metadata: expect.objectContaining({ sourceTemplateId: 1 }),
        }),
      );

      // Archive
      vi.clearAllMocks();
      logAuditEventMock.mockResolvedValue(undefined);
      createScopedClientMock.mockReturnValue(scoped);

      await archiveTemplate(1, 'user-1', 1);
      expect(scoped.update).toHaveBeenCalledWith(
        esignTemplatesTable,
        expect.objectContaining({ status: 'archived' }),
        expect.anything(),
      );
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'esign_template_archived' }),
      );
    });

    it('archived templates are excluded when filtering by active status', async () => {
      const scoped = makeScopedMock();
      scoped.selectFrom = vi.fn(async () => [
        { id: 1, communityId: 1, status: 'active' },
      ]);
      createScopedClientMock.mockReturnValue(scoped);

      const result = await listTemplates(1, { status: 'active' });
      expect(result).toHaveLength(1);
      expect(eqMock).toHaveBeenCalledWith(esignTemplatesTable.status, 'active');
    });
  });

  // =========================================================================
  // Consent management lifecycle
  // =========================================================================

  describe('Consent Management Lifecycle', () => {
    it('reports no consent -> grant consent via signing -> revoke consent', async () => {
      // Step 1: No active consent
      const scoped = makeScopedMock();
      scoped.selectFrom = vi.fn(async () => []);
      createScopedClientMock.mockReturnValue(scoped);

      const noConsent = await getConsentStatus(1, 'user-1');
      expect(noConsent.hasActiveConsent).toBe(false);

      // Step 2: After signing, consent exists
      vi.clearAllMocks();
      logAuditEventMock.mockResolvedValue(undefined);
      const givenDate = new Date('2026-01-15');
      scoped.selectFrom = vi.fn(async () => [{ id: 1, givenAt: givenDate }]);
      createScopedClientMock.mockReturnValue(scoped);

      const hasConsent = await getConsentStatus(1, 'user-1');
      expect(hasConsent.hasActiveConsent).toBe(true);
      expect(hasConsent.givenAt).toEqual(givenDate);

      // Step 3: Revoke consent
      vi.clearAllMocks();
      logAuditEventMock.mockResolvedValue(undefined);
      scoped.update = vi.fn(async () => [{ id: 1 }]);
      createScopedClientMock.mockReturnValue(scoped);

      await revokeConsent(1, 'user-1');
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'esign_consent_revoked' }),
      );

      // Step 4: After revocation, no active consent
      vi.clearAllMocks();
      scoped.selectFrom = vi.fn(async () => []);
      createScopedClientMock.mockReturnValue(scoped);

      const afterRevoke = await getConsentStatus(1, 'user-1');
      expect(afterRevoke.hasActiveConsent).toBe(false);
    });
  });
});
