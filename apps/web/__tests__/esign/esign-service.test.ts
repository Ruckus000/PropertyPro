import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — these are created before any imports run
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
  sendEmailMock,
  esignReminderEmailMock,
  eqMock,
  andMock,
  isNullMock,
  inMock,
  ltMock,
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
  sendEmailMock: vi.fn(),
  esignReminderEmailMock: vi.fn(() => ({ type: 'EsignReminderEmail' })),
  eqMock: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  andMock: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  isNullMock: vi.fn((...args: unknown[]) => ({ type: 'isNull', args })),
  inMock: vi.fn((...args: unknown[]) => ({ type: 'in', args })),
  ltMock: vi.fn((...args: unknown[]) => ({ type: 'lt', args })),
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

vi.mock('@propertypro/email', () => ({
  sendEmail: sendEmailMock,
  EsignReminderEmail: esignReminderEmailMock,
}));

import type { EsignFieldsSchema } from '@propertypro/shared';
import {
  createTemplate,
  listTemplates,
  getTemplate,
  updateTemplate,
  archiveTemplate,
  cloneTemplate,
  createSubmission,
  listSubmissions,
  getSubmission,
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

function makeScopedMock(overrides: Record<string, unknown> = {}) {
  return {
    insert: vi.fn(async () => [{ id: 1, communityId: 1, ...overrides }]),
    selectFrom: vi.fn(async () => [{ id: 1, communityId: 1, ...overrides }]),
    update: vi.fn(async () => [{ id: 1, communityId: 1, ...overrides }]),
    ...overrides,
  };
}

function validFieldsSchema(extra: Partial<EsignFieldsSchema> = {}): EsignFieldsSchema {
  return {
    version: 1,
    signerRoles: ['signer'],
    fields: [
      {
        id: 'f1',
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
    ...extra,
  };
}

function makeReminderSigner(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    communityId: 1,
    submissionId: 10,
    email: 'a@test.com',
    name: 'Alice',
    role: 'signer',
    sortOrder: 0,
    status: 'pending',
    slug: 'slug-1',
    reminderCount: 0,
    lastReminderAt: null,
    ...overrides,
  };
}

function makeReminderSubmission(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    communityId: 1,
    templateId: 3,
    externalId: 'sub-ext',
    status: 'pending',
    signingOrder: 'parallel',
    expiresAt: null,
    completedAt: null,
    signedDocumentPath: null,
    messageSubject: null,
    messageBody: null,
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeReminderTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 3,
    communityId: 1,
    name: 'Proxy Form',
    sourceDocumentPath: 'communities/1/esign-templates/proxy.pdf',
    fieldsSchema: validFieldsSchema(),
    templateType: 'custom',
    ...overrides,
  };
}

function queueReminderSelects(
  scoped: { selectFrom: ReturnType<typeof vi.fn> },
  {
    signer = makeReminderSigner(),
    submission = makeReminderSubmission(),
    signers = [signer],
    template = makeReminderTemplate(),
  }: {
    signer?: Record<string, unknown>;
    submission?: Record<string, unknown>;
    signers?: Record<string, unknown>[];
    template?: Record<string, unknown>;
  } = {},
): void {
  let callCount = 0;
  scoped.selectFrom = vi.fn(async () => {
    callCount++;
    if (callCount === 1) return [signer];
    if (callCount === 2) return [submission];
    if (callCount === 3) return signers;
    if (callCount === 4) return [];
    if (callCount === 5) return [template];
    return [];
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('esign-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    logAuditEventMock.mockResolvedValue(undefined);
    sendEmailMock.mockResolvedValue({ id: 'email-1' });
  });

  // =========================================================================
  // validateFieldsSchema (tested via createTemplate / updateTemplate)
  // =========================================================================

  describe('field schema validation (via createTemplate)', () => {
    it('rejects unsupported schema version', async () => {
      const scoped = makeScopedMock();
      createScopedClientMock.mockReturnValue(scoped);

      const schema = { ...validFieldsSchema(), version: 2 as unknown as 1 };

      await expect(
        createTemplate(1, 'user-1', {
          name: 'Test',
          templateType: 'custom',
          sourceDocumentPath: 'test.pdf',
          fieldsSchema: schema,
        }),
      ).rejects.toThrow('Unsupported fields schema version');
    });

    it('rejects fields with x outside 0-100', async () => {
      const scoped = makeScopedMock();
      createScopedClientMock.mockReturnValue(scoped);

      const schema = validFieldsSchema();
      schema.fields[0]!.x = -5;

      await expect(
        createTemplate(1, 'user-1', {
          name: 'Test',
          templateType: 'custom',
          sourceDocumentPath: 'test.pdf',
          fieldsSchema: schema,
        }),
      ).rejects.toThrow('x/y must be between 0 and 100');
    });

    it('rejects fields with x > 100', async () => {
      const scoped = makeScopedMock();
      createScopedClientMock.mockReturnValue(scoped);

      const schema = validFieldsSchema();
      schema.fields[0]!.x = 101;

      await expect(
        createTemplate(1, 'user-1', {
          name: 'Test',
          templateType: 'custom',
          sourceDocumentPath: 'test.pdf',
          fieldsSchema: schema,
        }),
      ).rejects.toThrow('x/y must be between 0 and 100');
    });

    it('rejects fields with y outside 0-100', async () => {
      const scoped = makeScopedMock();
      createScopedClientMock.mockReturnValue(scoped);

      const schema = validFieldsSchema();
      schema.fields[0]!.y = 150;

      await expect(
        createTemplate(1, 'user-1', {
          name: 'Test',
          templateType: 'custom',
          sourceDocumentPath: 'test.pdf',
          fieldsSchema: schema,
        }),
      ).rejects.toThrow('x/y must be between 0 and 100');
    });

    it('rejects fields with width <= 0', async () => {
      const scoped = makeScopedMock();
      createScopedClientMock.mockReturnValue(scoped);

      const schema = validFieldsSchema();
      schema.fields[0]!.width = 0;

      await expect(
        createTemplate(1, 'user-1', {
          name: 'Test',
          templateType: 'custom',
          sourceDocumentPath: 'test.pdf',
          fieldsSchema: schema,
        }),
      ).rejects.toThrow('width/height must be between 0 and 100');
    });

    it('rejects fields with height <= 0', async () => {
      const scoped = makeScopedMock();
      createScopedClientMock.mockReturnValue(scoped);

      const schema = validFieldsSchema();
      schema.fields[0]!.height = -1;

      await expect(
        createTemplate(1, 'user-1', {
          name: 'Test',
          templateType: 'custom',
          sourceDocumentPath: 'test.pdf',
          fieldsSchema: schema,
        }),
      ).rejects.toThrow('width/height must be between 0 and 100');
    });

    it('rejects fields with width > 100', async () => {
      const scoped = makeScopedMock();
      createScopedClientMock.mockReturnValue(scoped);

      const schema = validFieldsSchema();
      schema.fields[0]!.width = 101;

      await expect(
        createTemplate(1, 'user-1', {
          name: 'Test',
          templateType: 'custom',
          sourceDocumentPath: 'test.pdf',
          fieldsSchema: schema,
        }),
      ).rejects.toThrow('width/height must be between 0 and 100');
    });

    it('rejects fields extending beyond page bounds (x + width > 100)', async () => {
      const scoped = makeScopedMock();
      createScopedClientMock.mockReturnValue(scoped);

      const schema = validFieldsSchema();
      schema.fields[0]!.x = 80;
      schema.fields[0]!.width = 30; // 80 + 30 = 110 > 100

      await expect(
        createTemplate(1, 'user-1', {
          name: 'Test',
          templateType: 'custom',
          sourceDocumentPath: 'test.pdf',
          fieldsSchema: schema,
        }),
      ).rejects.toThrow('field extends beyond page bounds');
    });

    it('rejects fields extending beyond page bounds (y + height > 100)', async () => {
      const scoped = makeScopedMock();
      createScopedClientMock.mockReturnValue(scoped);

      const schema = validFieldsSchema();
      schema.fields[0]!.y = 96;
      schema.fields[0]!.height = 5; // 96 + 5 = 101 > 100

      await expect(
        createTemplate(1, 'user-1', {
          name: 'Test',
          templateType: 'custom',
          sourceDocumentPath: 'test.pdf',
          fieldsSchema: schema,
        }),
      ).rejects.toThrow('field extends beyond page bounds');
    });

    it('rejects fields with invalid signerRole', async () => {
      const scoped = makeScopedMock();
      createScopedClientMock.mockReturnValue(scoped);

      const schema = validFieldsSchema();
      schema.fields[0]!.signerRole = 'nonexistent_role';

      await expect(
        createTemplate(1, 'user-1', {
          name: 'Test',
          templateType: 'custom',
          sourceDocumentPath: 'test.pdf',
          fieldsSchema: schema,
        }),
      ).rejects.toThrow('signerRole "nonexistent_role" not in template roles');
    });

    it('accepts a valid schema', async () => {
      const scoped = makeScopedMock();
      createScopedClientMock.mockReturnValue(scoped);

      await createTemplate(1, 'user-1', {
        name: 'Test',
        templateType: 'custom',
        sourceDocumentPath: 'test.pdf',
        fieldsSchema: validFieldsSchema(),
      });

      expect(scoped.insert).toHaveBeenCalled();
      expect(logAuditEventMock).toHaveBeenCalled();
    });

    it('accepts edge-case field at exact boundary (x=0, y=0, width=100, height=100)', async () => {
      const scoped = makeScopedMock();
      createScopedClientMock.mockReturnValue(scoped);

      const schema = validFieldsSchema();
      schema.fields[0]!.x = 0;
      schema.fields[0]!.y = 0;
      schema.fields[0]!.width = 100;
      schema.fields[0]!.height = 100;

      await createTemplate(1, 'user-1', {
        name: 'Full Page',
        templateType: 'custom',
        sourceDocumentPath: 'test.pdf',
        fieldsSchema: schema,
      });

      expect(scoped.insert).toHaveBeenCalled();
    });

    it('validates schema during updateTemplate when fieldsSchema is provided', async () => {
      const scoped = makeScopedMock({
        fieldsSchema: validFieldsSchema(),
        status: 'active',
        name: 'Existing',
      });
      createScopedClientMock.mockReturnValue(scoped);

      const badSchema = validFieldsSchema();
      badSchema.fields[0]!.x = -10;

      await expect(
        updateTemplate(1, 'user-1', 1, { fieldsSchema: badSchema }),
      ).rejects.toThrow('x/y must be between 0 and 100');
    });
  });

  // =========================================================================
  // Slug generation (tested indirectly via createSubmission)
  // =========================================================================

  describe('signing slug generation (via createSubmission)', () => {
    it('generates slug for each signer that is set in the insert call', async () => {
      const insertedValues: unknown[] = [];

      const scoped = {
        selectFrom: vi.fn(async () => [
          {
            id: 1,
            communityId: 1,
            fieldsSchema: validFieldsSchema(),
            sourceDocumentPath: 'test.pdf',
            status: 'active',
            name: 'Template',
          },
        ]),
        insert: vi.fn(async (_table: unknown, data: unknown) => {
          insertedValues.push(data);
          // Batch signer insert receives an array; return each row
          if (Array.isArray(data)) {
            return data.map((item: Record<string, unknown>, i: number) => ({
              id: i + 1,
              communityId: 1,
              ...item,
            }));
          }
          return [{ id: insertedValues.length, communityId: 1, ...(data as Record<string, unknown>) }];
        }),
        update: vi.fn(async () => []),
      };
      createScopedClientMock.mockReturnValue(scoped);

      await createSubmission(1, 'user-1', {
        templateId: 1,
        signers: [
          { email: 'a@test.com', name: 'Alice', role: 'signer', sortOrder: 0 },
        ],
        signingOrder: 'parallel',
        sendEmail: true,
      });

      // The second insert call is for the signer batch (first is submission)
      // data is an array of signer objects; find the one with a slug
      const signerBatch = insertedValues.find(
        (v) => Array.isArray(v) && v.length > 0 && typeof (v as Record<string, unknown>[])[0]?.slug === 'string',
      ) as Record<string, unknown>[] | undefined;
      expect(signerBatch).toBeDefined();

      const slug = signerBatch![0]!.slug as string;
      // Slug should be 64 hex characters (two UUIDs with dashes removed: 32 + 32)
      expect(slug).toHaveLength(64);
      expect(slug).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  // =========================================================================
  // Template CRUD
  // =========================================================================

  describe('createTemplate', () => {
    it('inserts into esignTemplates and logs audit event', async () => {
      const scoped = makeScopedMock({ name: 'New Template' });
      createScopedClientMock.mockReturnValue(scoped);

      const result = await createTemplate(1, 'user-1', {
        name: 'New Template',
        templateType: 'proxy',
        sourceDocumentPath: 'docs/proxy.pdf',
        fieldsSchema: validFieldsSchema(),
      });

      expect(scoped.insert).toHaveBeenCalledTimes(1);
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: 'esign_template_created',
          resourceType: 'esign_template',
          communityId: 1,
        }),
      );
      expect(result).toBeDefined();
      expect(result.name).toBe('New Template');
    });
  });

  describe('listTemplates', () => {
    it('returns all templates when no filters given', async () => {
      const scoped = makeScopedMock();
      scoped.selectFrom = vi.fn(async () => [
        { id: 1, communityId: 1 },
        { id: 2, communityId: 1 },
      ]);
      createScopedClientMock.mockReturnValue(scoped);

      const result = await listTemplates(1);
      expect(result).toHaveLength(2);
      expect(scoped.selectFrom).toHaveBeenCalledWith(
        esignTemplatesTable,
        {},
        undefined,
      );
    });

    it('applies status filter', async () => {
      const scoped = makeScopedMock();
      createScopedClientMock.mockReturnValue(scoped);

      await listTemplates(1, { status: 'active' });

      expect(eqMock).toHaveBeenCalledWith(esignTemplatesTable.status, 'active');
    });

    it('applies type filter', async () => {
      const scoped = makeScopedMock();
      createScopedClientMock.mockReturnValue(scoped);

      await listTemplates(1, { type: 'proxy' });

      expect(eqMock).toHaveBeenCalledWith(esignTemplatesTable.templateType, 'proxy');
    });
  });

  describe('getTemplate', () => {
    it('returns the template when found', async () => {
      const scoped = makeScopedMock({ name: 'Found Template' });
      createScopedClientMock.mockReturnValue(scoped);

      const result = await getTemplate(1, 1);
      expect(result.name).toBe('Found Template');
    });

    it('throws NotFoundError when template not found', async () => {
      const scoped = makeScopedMock();
      scoped.selectFrom = vi.fn(async () => []);
      createScopedClientMock.mockReturnValue(scoped);

      await expect(getTemplate(1, 999)).rejects.toThrow('Template not found');
    });
  });

  describe('archiveTemplate', () => {
    it('updates status to archived and logs audit event', async () => {
      const scoped = makeScopedMock({ status: 'active' });
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
  });

  describe('cloneTemplate', () => {
    it('creates a new template with the new name', async () => {
      const scoped = makeScopedMock({
        name: 'Cloned',
        description: 'Source desc',
        sourceDocumentPath: 'path.pdf',
        templateType: 'custom',
        fieldsSchema: validFieldsSchema(),
        status: 'active',
      });
      createScopedClientMock.mockReturnValue(scoped);

      const result = await cloneTemplate(1, 'user-1', 1, 'Cloned');
      expect(result).toBeDefined();
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'esign_template_cloned',
          metadata: expect.objectContaining({ sourceTemplateId: 1 }),
        }),
      );
    });
  });

  // =========================================================================
  // Submission lifecycle
  // =========================================================================

  describe('createSubmission', () => {
    it('rejects if template has no field definitions', async () => {
      const scoped = makeScopedMock({
        fieldsSchema: null,
        sourceDocumentPath: 'test.pdf',
        status: 'active',
      });
      createScopedClientMock.mockReturnValue(scoped);

      await expect(
        createSubmission(1, 'user-1', {
          templateId: 1,
          signers: [{ email: 'a@test.com', name: 'A', role: 'signer', sortOrder: 0 }],
          signingOrder: 'parallel',
          sendEmail: false,
        }),
      ).rejects.toThrow('Template has no field definitions');
    });

    it('rejects signer with role not defined in template', async () => {
      const scoped = makeScopedMock({
        fieldsSchema: validFieldsSchema(),
        sourceDocumentPath: 'test.pdf',
        status: 'active',
      });
      createScopedClientMock.mockReturnValue(scoped);

      await expect(
        createSubmission(1, 'user-1', {
          templateId: 1,
          signers: [{ email: 'a@test.com', name: 'A', role: 'bad_role', sortOrder: 0 }],
          signingOrder: 'parallel',
          sendEmail: false,
        }),
      ).rejects.toThrow('Signer role "bad_role" not defined in template');
    });

    it('rejects templates without a source PDF', async () => {
      const scoped = makeScopedMock({
        fieldsSchema: validFieldsSchema(),
        sourceDocumentPath: null,
        status: 'active',
      });
      createScopedClientMock.mockReturnValue(scoped);

      await expect(
        createSubmission(1, 'user-1', {
          templateId: 1,
          signers: [{ email: 'a@test.com', name: 'A', role: 'signer', sortOrder: 0 }],
          signingOrder: 'parallel',
          sendEmail: false,
        }),
      ).rejects.toThrow('Template must have a source PDF before it can be sent for signing');
    });

    it('creates submission, signers, and event on success', async () => {
      const insertCalls: unknown[] = [];
      const scoped = {
        selectFrom: vi.fn(async () => [
          {
            id: 1,
            communityId: 1,
            fieldsSchema: validFieldsSchema(),
            sourceDocumentPath: 'test.pdf',
            status: 'active',
            name: 'Template',
          },
        ]),
        insert: vi.fn(async (_table: unknown, data: unknown) => {
          insertCalls.push(data);
          // Batch signer insert receives an array; return each row
          if (Array.isArray(data)) {
            return data.map((item: Record<string, unknown>, i: number) => ({
              id: i + 1,
              communityId: 1,
              ...item,
            }));
          }
          return [{ id: insertCalls.length, communityId: 1, ...(data as Record<string, unknown>) }];
        }),
        update: vi.fn(async () => []),
      };
      createScopedClientMock.mockReturnValue(scoped);

      const result = await createSubmission(1, 'user-1', {
        templateId: 1,
        signers: [
          { email: 'a@test.com', name: 'Alice', role: 'signer', sortOrder: 0 },
          { email: 'b@test.com', name: 'Bob', role: 'signer', sortOrder: 1 },
        ],
        signingOrder: 'sequential',
        sendEmail: true,
      });

      expect(result.submission).toBeDefined();
      expect(result.signers).toHaveLength(2);
      // 1 submission + 1 batch signers insert + 1 event = 3 inserts
      expect(scoped.insert).toHaveBeenCalledTimes(3);
      expect(logAuditEventMock).toHaveBeenCalled();
    });
  });

  describe('listSubmissions', () => {
    it('returns all submissions when no filter', async () => {
      const scoped = makeScopedMock();
      scoped.selectFrom = vi.fn(async () => [{ id: 1 }, { id: 2 }]);
      createScopedClientMock.mockReturnValue(scoped);

      const result = await listSubmissions(1);
      expect(result).toHaveLength(2);
    });

    it('filters by status', async () => {
      const scoped = makeScopedMock();
      scoped.selectFrom = vi.fn(async () => [
        { id: 1, communityId: 1, status: 'pending', expiresAt: null },
        { id: 2, communityId: 1, status: 'pending', expiresAt: '2025-01-01T00:00:00.000Z' },
      ]);
      createScopedClientMock.mockReturnValue(scoped);

      const pending = await listSubmissions(1, { status: 'pending' });
      const expired = await listSubmissions(1, { status: 'expired' });

      expect(pending).toHaveLength(1);
      expect(pending[0]?.id).toBe(1);
      expect(pending[0]?.effectiveStatus).toBe('pending');
      expect(expired).toHaveLength(1);
      expect(expired[0]?.id).toBe(2);
      expect(expired[0]?.effectiveStatus).toBe('expired');
    });
  });

  describe('getSubmission', () => {
    it('throws NotFoundError when submission not found', async () => {
      const scoped = makeScopedMock();
      scoped.selectFrom = vi.fn(async () => []);
      createScopedClientMock.mockReturnValue(scoped);

      await expect(getSubmission(1, 999)).rejects.toThrow('Submission not found');
    });

    it('returns submission, signers, and events', async () => {
      const scoped = makeScopedMock();
      let callCount = 0;
      scoped.selectFrom = vi.fn(async () => {
        callCount++;
        if (callCount === 1) return [{ id: 1, communityId: 1, status: 'pending' }]; // submission
        if (callCount === 2) return [{ id: 10, communityId: 1 }]; // signers
        return [{ id: 20, communityId: 1, eventType: 'created' }]; // events
      });
      createScopedClientMock.mockReturnValue(scoped);

      const result = await getSubmission(1, 1);
      expect(result.submission).toBeDefined();
      expect(result.signers).toHaveLength(1);
      expect(result.events).toHaveLength(1);
    });
  });

  describe('cancelSubmission', () => {
    it('throws if submission is not pending', async () => {
      const scoped = makeScopedMock();
      let callCount = 0;
      scoped.selectFrom = vi.fn(async () => {
        callCount++;
        if (callCount === 1) return [{ id: 1, communityId: 1, status: 'completed' }];
        return [];
      });
      createScopedClientMock.mockReturnValue(scoped);

      await expect(cancelSubmission(1, 'user-1', 1)).rejects.toThrow(
        'Only pending submissions can be cancelled',
      );
    });

    it('updates status to cancelled and logs event', async () => {
      const scoped = makeScopedMock();
      let callCount = 0;
      scoped.selectFrom = vi.fn(async () => {
        callCount++;
        if (callCount === 1) return [{ id: 1, communityId: 1, status: 'pending' }];
        if (callCount === 2) return []; // signers
        return []; // events
      });
      createScopedClientMock.mockReturnValue(scoped);

      await cancelSubmission(1, 'user-1', 1);

      expect(scoped.update).toHaveBeenCalledWith(
        esignSubmissionsTable,
        expect.objectContaining({ status: 'cancelled' }),
        expect.anything(),
      );
      expect(scoped.insert).toHaveBeenCalledWith(
        esignEventsTable,
        expect.objectContaining({ eventType: 'cancelled' }),
      );
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'esign_submission_cancelled' }),
      );
    });
  });

  // =========================================================================
  // Reminder limits
  // =========================================================================

  describe('sendReminder', () => {
    const makeCommunityAdmin = () => ({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            limit: vi.fn(async () => ({
              data: [{ name: 'Sunset Condos', timezone: 'America/New_York' }],
              error: null,
            })),
          })),
        })),
      })),
    });

    it('throws NotFoundError when signer not found', async () => {
      const scoped = makeScopedMock();
      scoped.selectFrom = vi.fn(async () => []);
      createScopedClientMock.mockReturnValue(scoped);

      await expect(sendReminder(1, 'user-1', 10, 999)).rejects.toThrow('Signer not found');
    });

    it('throws when signer status is completed', async () => {
      const scoped = makeScopedMock();
      queueReminderSelects(scoped, {
        signer: makeReminderSigner({ status: 'completed' }),
      });
      createScopedClientMock.mockReturnValue(scoped);

      await expect(sendReminder(1, 'user-1', 1, 1)).rejects.toThrow(
        'Can only send reminders to pending or opened signers',
      );
    });

    it('throws when signer status is declined', async () => {
      const scoped = makeScopedMock();
      queueReminderSelects(scoped, {
        signer: makeReminderSigner({ status: 'declined' }),
      });
      createScopedClientMock.mockReturnValue(scoped);

      await expect(sendReminder(1, 'user-1', 1, 1)).rejects.toThrow(
        'Can only send reminders to pending or opened signers',
      );
    });

    it('throws when reminder count >= ESIGN_MAX_REMINDERS (3)', async () => {
      const scoped = makeScopedMock();
      queueReminderSelects(scoped, {
        signer: makeReminderSigner({ reminderCount: 3 }),
      });
      createScopedClientMock.mockReturnValue(scoped);

      await expect(sendReminder(1, 'user-1', 1, 1)).rejects.toThrow(
        'Maximum of 3 reminders reached',
      );
    });

    it('increments reminder count and logs event on success', async () => {
      const scoped = makeScopedMock();
      queueReminderSelects(scoped, {
        signer: makeReminderSigner({ reminderCount: 1 }),
        signers: [makeReminderSigner({ reminderCount: 1 })],
      });
      createScopedClientMock.mockReturnValue(scoped);
      createAdminClientMock.mockReturnValue(makeCommunityAdmin());

      await sendReminder(1, 'user-1', 10, 1);

      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      expect(sendEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'a@test.com',
          subject: 'Reminder: Signature needed for Proxy Form',
        }),
      );
      expect(esignReminderEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          branding: expect.objectContaining({ communityName: 'Sunset Condos' }),
          signerName: 'Alice',
          documentName: 'Proxy Form',
          signingUrl: 'http://localhost:3000/sign/sub-ext/slug-1',
          reminderNumber: 2,
        }),
      );
      expect(scoped.update).toHaveBeenCalledWith(
        esignSignersTable,
        expect.objectContaining({
          reminderCount: 2,
          lastReminderAt: expect.any(Date),
        }),
        expect.anything(),
      );
      expect(scoped.insert).toHaveBeenCalledWith(
        esignEventsTable,
        expect.objectContaining({
          eventType: 'reminder_sent',
          eventData: { reminderNumber: 2 },
        }),
      );
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'esign_reminder_sent' }),
      );
    });

    it('allows reminders for opened signers', async () => {
      const scoped = makeScopedMock();
      queueReminderSelects(scoped, {
        signer: makeReminderSigner({ status: 'opened' }),
        signers: [makeReminderSigner({ status: 'opened' })],
      });
      createScopedClientMock.mockReturnValue(scoped);
      createAdminClientMock.mockReturnValue(makeCommunityAdmin());

      await sendReminder(1, 'user-1', 10, 1);

      expect(scoped.update).toHaveBeenCalled();
    });

    it('does not mutate reminder state when email delivery fails', async () => {
      const scoped = makeScopedMock();
      queueReminderSelects(scoped);
      createScopedClientMock.mockReturnValue(scoped);
      createAdminClientMock.mockReturnValue(makeCommunityAdmin());
      sendEmailMock.mockRejectedValueOnce(new Error('smtp down'));

      await expect(sendReminder(1, 'user-1', 10, 1)).rejects.toThrow('smtp down');
      expect(scoped.update).not.toHaveBeenCalled();
      expect(scoped.insert).not.toHaveBeenCalled();
    });

    it('fails when signerId does not belong to the given submissionId (cross-submission)', async () => {
      const scoped = makeScopedMock();
      // The AND filter on (signers.id = signerId AND signers.submissionId = submissionId)
      // returns empty when the signer belongs to a different submission
      scoped.selectFrom = vi.fn(async () => []);
      createScopedClientMock.mockReturnValue(scoped);

      await expect(sendReminder(1, 'user-1', 99, 1)).rejects.toThrow('Signer not found');
    });
  });

  // =========================================================================
  // Consent management
  // =========================================================================

  describe('getConsentStatus', () => {
    it('returns no active consent when no rows', async () => {
      const scoped = makeScopedMock();
      scoped.selectFrom = vi.fn(async () => []);
      createScopedClientMock.mockReturnValue(scoped);

      const result = await getConsentStatus(1, 'user-1');
      expect(result.hasActiveConsent).toBe(false);
      expect(result.givenAt).toBeNull();
    });

    it('returns active consent when rows exist', async () => {
      const givenDate = new Date('2026-01-15');
      const scoped = makeScopedMock();
      scoped.selectFrom = vi.fn(async () => [{ id: 1, givenAt: givenDate }]);
      createScopedClientMock.mockReturnValue(scoped);

      const result = await getConsentStatus(1, 'user-1');
      expect(result.hasActiveConsent).toBe(true);
      expect(result.givenAt).toEqual(givenDate);
    });
  });

  describe('revokeConsent', () => {
    it('updates consent with revokedAt and logs audit event', async () => {
      const scoped = makeScopedMock();
      createScopedClientMock.mockReturnValue(scoped);

      await revokeConsent(1, 'user-1');

      expect(scoped.update).toHaveBeenCalledWith(
        esignConsentTable,
        expect.objectContaining({ revokedAt: expect.any(Date) }),
        expect.anything(),
      );
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'esign_consent_revoked',
          resourceType: 'esign_consent',
        }),
      );
    });
  });

  // =========================================================================
  // updateTemplate — audit action fix verification
  // =========================================================================

  describe('updateTemplate', () => {
    it('logs esign_template_updated audit action (not esign_template_created)', async () => {
      const scoped = makeScopedMock({
        fieldsSchema: validFieldsSchema(),
        status: 'active',
        name: 'Existing',
      });
      createScopedClientMock.mockReturnValue(scoped);

      await updateTemplate(1, 'user-1', 1, { name: 'Updated Name' });

      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'esign_template_updated',
          resourceType: 'esign_template',
        }),
      );
    });

    it('passes old and new values to audit event', async () => {
      const scoped = makeScopedMock({
        fieldsSchema: validFieldsSchema(),
        status: 'active',
        name: 'Old Name',
      });
      createScopedClientMock.mockReturnValue(scoped);

      await updateTemplate(1, 'user-1', 1, { name: 'New Name' });

      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          oldValues: expect.objectContaining({ name: 'Old Name' }),
          newValues: expect.any(Object),
        }),
      );
    });
  });

  // =========================================================================
  // submitSignature — double-sign prevention, atomic guard
  // =========================================================================

  describe('submitSignature', () => {
    it('throws when atomic update returns 0 rows (double-sign race)', async () => {
      // getSignerContext uses the admin client to find the signer by slug
      const signerRow = {
        id: 1, community_id: 1, submission_id: 10,
        external_id: 'ext-1', user_id: null, email: 'signer@test.com',
        name: 'Signer', role: 'signer', slug: 'test-slug',
        sort_order: 0, status: 'opened', opened_at: '2026-01-01',
        completed_at: null, signed_values: null, reminder_count: 0,
        created_at: '2026-01-01', deleted_at: null,
      };

      let adminFromCallCount = 0;
      const admin = {
        from: vi.fn(() => {
          adminFromCallCount++;
          const c: Record<string, unknown> = {};

          c.select = vi.fn(() => {
            const sc: Record<string, unknown> = {};
            sc.eq = vi.fn(() => sc);
            sc.is = vi.fn(() => sc);
            sc.lt = vi.fn(() => sc);
            sc.limit = vi.fn(async () => {
              if (adminFromCallCount === 1) return { data: [signerRow], error: null };
              if (adminFromCallCount === 2) return {
                data: [{
                  id: 10, community_id: 1, template_id: 1, external_id: 'sub-ext',
                  status: 'pending', signing_order: 'parallel', send_email: true,
                  expires_at: null, completed_at: null, signed_document_path: null,
                  message_subject: null, message_body: null, created_by: 'user-1',
                  created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null,
                }],
                error: null,
              };
              if (adminFromCallCount === 3) return {
                data: [{
                  id: 1, community_id: 1, external_id: 'tpl-ext', name: 'Template',
                  description: null, source_document_path: 'test.pdf',
                  template_type: 'custom', fields_schema: validFieldsSchema(),
                  status: 'active', created_by: 'user-1', created_at: '2026-01-01',
                  updated_at: '2026-01-01', deleted_at: null,
                }],
                error: null,
              };
              return { data: [], error: null };
            });
            sc.then = (resolve: (v: unknown) => void) =>
              resolve({ data: [signerRow], error: null });
            return sc;
          });

          c.update = vi.fn(() => {
            const uc: Record<string, unknown> = {};
            uc.eq = vi.fn(() => uc);
            uc.in = vi.fn(() => uc);
            uc.select = vi.fn(async () => ({ data: [{ id: 1 }], error: null }));
            return uc;
          });

          c.insert = vi.fn(async () => ({ data: [{ id: 1 }], error: null }));

          return c;
        }),
      };
      createAdminClientMock.mockReturnValue(admin);

      // submitSignature now uses the scoped client for mutations.
      // The scoped client's .update() returns empty => atomic guard triggers double-sign error.
      const scoped = makeScopedMock();
      scoped.update = vi.fn(async () => []); // Empty = race condition, already signed
      createScopedClientMock.mockReturnValue(scoped);

      await expect(
        submitSignature(
          'test-slug',
          {
            signedValues: { f1: { fieldId: 'f1', type: 'signature', value: 'sig', signedAt: '2026-01-01T00:00:00Z' } },
            consentGiven: true,
          },
          '127.0.0.1',
          'TestAgent/1.0',
        ),
      ).rejects.toThrow('You have already signed this document');
    });
  });
});
