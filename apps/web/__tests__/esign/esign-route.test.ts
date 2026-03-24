import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  getSignerContextMock,
  submitSignatureMock,
  declineSigningMock,
  cancelSubmissionMock,
  getConsentStatusMock,
  revokeConsentMock,
  sendReminderMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  createPresignedDownloadUrlMock,
  parseCommunityIdFromQueryMock,
  parseCommunityIdFromBodyMock,
  requireEsignReadPermissionMock,
  requireEsignWritePermissionMock,
  getTemplateMock,
} = vi.hoisted(() => ({
  getSignerContextMock: vi.fn(),
  submitSignatureMock: vi.fn(),
  declineSigningMock: vi.fn(),
  cancelSubmissionMock: vi.fn(),
  getConsentStatusMock: vi.fn(),
  revokeConsentMock: vi.fn(),
  sendReminderMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  createPresignedDownloadUrlMock: vi.fn(),
  parseCommunityIdFromQueryMock: vi.fn(),
  parseCommunityIdFromBodyMock: vi.fn(),
  requireEsignReadPermissionMock: vi.fn(),
  requireEsignWritePermissionMock: vi.fn(),
  getTemplateMock: vi.fn(),
}));

// Mock the esign service
vi.mock('@/lib/services/esign-service', () => ({
  getSignerContext: getSignerContextMock,
  submitSignature: submitSignatureMock,
  declineSigning: declineSigningMock,
  cancelSubmission: cancelSubmissionMock,
  getConsentStatus: getConsentStatusMock,
  revokeConsent: revokeConsentMock,
  sendReminder: sendReminderMock,
  getTemplate: getTemplateMock,
}));

// Mock auth
vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

// Mock db
vi.mock('@propertypro/db', () => ({
  createPresignedDownloadUrl: createPresignedDownloadUrlMock,
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(() => ({})),
}));

// Mock finance request helpers
vi.mock('@/lib/finance/request', () => ({
  parseCommunityIdFromQuery: parseCommunityIdFromQueryMock,
  parseCommunityIdFromBody: parseCommunityIdFromBodyMock,
}));

// Mock esign route helpers
vi.mock('@/lib/esign/esign-route-helpers', () => ({
  requireEsignReadPermission: requireEsignReadPermissionMock,
  requireEsignWritePermission: requireEsignWritePermissionMock,
}));

// Mock error handler to pass through
vi.mock('@/lib/api/error-handler', () => ({
  withErrorHandler: (handler: unknown) => handler,
}));

vi.mock('@/lib/api/errors', () => ({
  BadRequestError: class BadRequestError extends Error {
    constructor(msg: string) { super(msg); this.name = 'BadRequestError'; }
  },
  ValidationError: class ValidationError extends Error {
    constructor(msg: string) { super(msg); this.name = 'ValidationError'; }
  },
}));

vi.mock('@/lib/api/zod/error-formatter', () => ({
  formatZodErrors: vi.fn(() => ({})),
}));

// Mock subscription guard
vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Import routes after mocks
// ---------------------------------------------------------------------------

import { GET as signingGET, POST as signingPOST } from '../../src/app/api/v1/esign/sign/[submissionExternalId]/[slug]/route';
import { GET as consentGET, DELETE as consentDELETE } from '../../src/app/api/v1/esign/consent/route';
import { POST as cancelPOST } from '../../src/app/api/v1/esign/submissions/[id]/cancel/route';
import { POST as remindPOST } from '../../src/app/api/v1/esign/submissions/[id]/remind/route';
import { GET as templatePdfGET } from '../../src/app/api/v1/esign/templates/[id]/pdf/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(url: string, opts?: RequestInit) {
  return new NextRequest(new URL(url, 'http://localhost:3000'), opts);
}

function makeRouteParams(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

const defaultMembership = {
  userId: 'user-1',
  communityId: 1,
  role: 'board_member',
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board Member',
  presetKey: 'board_member',
  permissions: {
    resources: {
      esign: { read: true, write: true },
      documents: { read: true, write: true },
      meetings: { read: true, write: true },
      announcements: { read: true, write: true },
      compliance: { read: true, write: true },
      residents: { read: true, write: true },
      financial: { read: true, write: true },
      maintenance: { read: true, write: true },
      violations: { read: true, write: true },
      leases: { read: true, write: true },
      contracts: { read: true, write: true },
      polls: { read: true, write: true },
      settings: { read: true, write: true },
      audit: { read: true, write: true },
      arc_submissions: { read: true, write: true },
      work_orders: { read: true, write: true },
      amenities: { read: true, write: true },
      packages: { read: true, write: true },
      visitors: { read: true, write: true },
      calendar_sync: { read: true, write: true },
      accounting: { read: true, write: true },
      finances: { read: true, write: true },
    },
  },
  communityType: 'condo_718',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('E-Sign Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(defaultMembership);
    parseCommunityIdFromQueryMock.mockReturnValue(1);
    parseCommunityIdFromBodyMock.mockReturnValue(1);
  });

  // =========================================================================
  // Signing GET route
  // =========================================================================

  describe('GET /api/v1/esign/sign/[submissionExternalId]/[slug]', () => {
    it('returns pdfUrl (presigned URL, not raw storage path)', async () => {
      const presignedUrl = 'https://supabase.storage/signed-url?token=abc';
      createPresignedDownloadUrlMock.mockResolvedValue(presignedUrl);

      getSignerContextMock.mockResolvedValue({
        signer: {
          id: 1, externalId: 'ext-1', email: 'a@test.com', name: 'Alice',
          role: 'signer', status: 'opened',
        },
        submission: {
          externalId: 'sub-ext', messageSubject: null, messageBody: null,
          expiresAt: null,
        },
        template: {
          name: 'Template', description: null,
          sourceDocumentPath: 'communities/1/esign/template.pdf',
          fieldsSchema: {
            version: 1,
            signerRoles: ['signer'],
            fields: [
              { id: 'f1', type: 'signature', signerRole: 'signer', page: 0, x: 10, y: 20, width: 30, height: 5, required: true },
            ],
          },
        },
        isWaiting: false,
        waitingFor: null,
      });

      const req = makeRequest('/api/v1/esign/sign/sub-ext/test-slug');
      const context = makeRouteParams({ submissionExternalId: 'sub-ext', slug: 'test-slug' });

      const response = await signingGET(req, context);
      const json = await response.json();

      // Should contain the presigned URL, not the raw path
      expect(json.data.pdfUrl).toBe(presignedUrl);
      expect(getSignerContextMock).toHaveBeenCalledWith('test-slug', 'sub-ext');
      expect(createPresignedDownloadUrlMock).toHaveBeenCalledWith(
        'documents',
        'communities/1/esign/template.pdf',
      );
    });

    it('returns null pdfUrl when template has no sourceDocumentPath', async () => {
      getSignerContextMock.mockResolvedValue({
        signer: {
          id: 1, externalId: 'ext-1', email: 'a@test.com', name: 'Alice',
          role: 'signer', status: 'opened',
        },
        submission: {
          externalId: 'sub-ext', messageSubject: null, messageBody: null,
          expiresAt: null,
        },
        template: {
          name: 'Template', description: null,
          sourceDocumentPath: null,
          fieldsSchema: {
            version: 1, signerRoles: ['signer'], fields: [],
          },
        },
        isWaiting: false,
        waitingFor: null,
      });

      const req = makeRequest('/api/v1/esign/sign/sub-ext/test-slug');
      const context = makeRouteParams({ submissionExternalId: 'sub-ext', slug: 'test-slug' });

      const response = await signingGET(req, context);
      const json = await response.json();

      expect(json.data.pdfUrl).toBeNull();
      expect(createPresignedDownloadUrlMock).not.toHaveBeenCalled();
    });

    it('filters fields by signer role', async () => {
      getSignerContextMock.mockResolvedValue({
        signer: {
          id: 1, externalId: 'ext-1', email: 'a@test.com', name: 'Alice',
          role: 'signer', status: 'opened',
        },
        submission: {
          externalId: 'sub-ext', messageSubject: null, messageBody: null,
          expiresAt: null,
        },
        template: {
          name: 'Template', description: null, sourceDocumentPath: null,
          fieldsSchema: {
            version: 1,
            signerRoles: ['signer', 'witness'],
            fields: [
              { id: 'f1', type: 'signature', signerRole: 'signer', page: 0, x: 10, y: 20, width: 30, height: 5, required: true },
              { id: 'f2', type: 'signature', signerRole: 'witness', page: 0, x: 10, y: 50, width: 30, height: 5, required: true },
              { id: 'f3', type: 'text', signerRole: 'signer', page: 0, x: 10, y: 70, width: 30, height: 5, required: true },
            ],
          },
        },
        isWaiting: false,
        waitingFor: null,
      });

      const req = makeRequest('/api/v1/esign/sign/sub-ext/test-slug');
      const context = makeRouteParams({ submissionExternalId: 'sub-ext', slug: 'test-slug' });

      const response = await signingGET(req, context);
      const json = await response.json();

      // Should only include fields for 'signer' role, not 'witness'
      expect(json.data.fields).toHaveLength(2);
      expect(json.data.fields.every((f: { signerRole: string }) => f.signerRole === 'signer')).toBe(true);
    });

    it('throws BadRequestError when slug is missing', async () => {
      const req = makeRequest('/api/v1/esign/sign/sub-ext/');
      const context = makeRouteParams({ submissionExternalId: 'sub-ext', slug: '' });

      // The route handler checks for falsy slug — empty string is falsy
      // The actual route should throw BadRequestError
      await expect(signingGET(req, context)).rejects.toThrow('Missing signing slug');
    });
  });

  // =========================================================================
  // Signing POST route
  // =========================================================================

  describe('POST /api/v1/esign/sign/[submissionExternalId]/[slug]', () => {
    it('submits valid signature and returns success', async () => {
      submitSignatureMock.mockResolvedValue({ success: true });

      const body = {
        signedValues: {
          f1: {
            fieldId: 'f1',
            type: 'signature',
            value: 'data:image/png;base64,abc',
            signedAt: '2026-01-01T00:00:00Z',
          },
        },
        consentGiven: true,
      };

      const req = makeRequest('/api/v1/esign/sign/sub-ext/test-slug', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '192.168.1.1',
          'user-agent': 'TestBrowser/1.0',
        },
      });
      const context = makeRouteParams({ submissionExternalId: 'sub-ext', slug: 'test-slug' });

      const response = await signingPOST(req, context);
      const json = await response.json();

      expect(json.data.success).toBe(true);
      expect(submitSignatureMock).toHaveBeenCalledWith(
        'test-slug',
        expect.objectContaining({ consentGiven: true }),
        '192.168.1.1',
        'TestBrowser/1.0',
        'sub-ext',
      );
    });

    it('rejects an empty signedValues payload', async () => {
      const body = {
        signedValues: {},
        consentGiven: true,
      };

      const req = makeRequest('/api/v1/esign/sign/sub-ext/test-slug', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      });
      const context = makeRouteParams({ submissionExternalId: 'sub-ext', slug: 'test-slug' });

      await expect(signingPOST(req, context)).rejects.toThrow();
      expect(submitSignatureMock).not.toHaveBeenCalled();
    });

    it('rejects payload missing consentGiven', async () => {
      const body = {
        signedValues: {
          f1: { fieldId: 'f1', type: 'signature', value: 'sig', signedAt: '2026-01-01T00:00:00Z' },
        },
        // consentGiven is missing
      };

      const req = makeRequest('/api/v1/esign/sign/sub-ext/test-slug', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      });
      const context = makeRouteParams({ submissionExternalId: 'sub-ext', slug: 'test-slug' });

      // Should throw ValidationError since consentGiven is missing and it's not a decline action
      await expect(signingPOST(req, context)).rejects.toThrow();
    });

    it('rejects payload with consentGiven=false', async () => {
      const body = {
        signedValues: {
          f1: { fieldId: 'f1', type: 'signature', value: 'sig', signedAt: '2026-01-01T00:00:00Z' },
        },
        consentGiven: false,
      };

      const req = makeRequest('/api/v1/esign/sign/sub-ext/test-slug', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      });
      const context = makeRouteParams({ submissionExternalId: 'sub-ext', slug: 'test-slug' });

      // z.literal(true) rejects false — and it's not a valid decline either
      await expect(signingPOST(req, context)).rejects.toThrow();
    });

    it('rejects invalid field type in signedValues', async () => {
      const body = {
        signedValues: {
          f1: { fieldId: 'f1', type: 'invalid_type', value: 'sig', signedAt: '2026-01-01T00:00:00Z' },
        },
        consentGiven: true,
      };

      const req = makeRequest('/api/v1/esign/sign/sub-ext/test-slug', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      });
      const context = makeRouteParams({ submissionExternalId: 'sub-ext', slug: 'test-slug' });

      await expect(signingPOST(req, context)).rejects.toThrow();
    });

    it('handles decline action correctly', async () => {
      declineSigningMock.mockResolvedValue({ success: true });

      const body = {
        action: 'decline',
        reason: 'I do not agree with the terms',
      };

      const req = makeRequest('/api/v1/esign/sign/sub-ext/test-slug', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      });
      const context = makeRouteParams({ submissionExternalId: 'sub-ext', slug: 'test-slug' });

      const response = await signingPOST(req, context);
      const json = await response.json();

      expect(json.data.success).toBe(true);
      expect(declineSigningMock).toHaveBeenCalledWith(
        'test-slug',
        'I do not agree with the terms',
        'sub-ext',
      );
      expect(submitSignatureMock).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Consent GET/DELETE routes
  // =========================================================================

  describe('GET /api/v1/esign/consent', () => {
    it('returns consent status for authenticated user', async () => {
      getConsentStatusMock.mockResolvedValue({
        hasActiveConsent: true,
        givenAt: new Date('2026-01-15'),
      });

      const req = makeRequest('/api/v1/esign/consent?communityId=1');

      const response = await consentGET(req);
      const json = await response.json();

      expect(json.data.hasActiveConsent).toBe(true);
      expect(requireEsignReadPermissionMock).toHaveBeenCalled();
    });
  });

  describe('DELETE /api/v1/esign/consent', () => {
    it('revokes consent and checks write permission', async () => {
      revokeConsentMock.mockResolvedValue(undefined);

      const req = makeRequest('/api/v1/esign/consent?communityId=1', {
        method: 'DELETE',
        headers: { 'x-request-id': 'req-123' },
      });

      const response = await consentDELETE(req);
      const json = await response.json();

      expect(json.data.success).toBe(true);
      expect(requireEsignWritePermissionMock).toHaveBeenCalled();
      expect(revokeConsentMock).toHaveBeenCalledWith(1, 'user-1', 'req-123');
    });
  });

  describe('POST /api/v1/esign/submissions/[id]/cancel', () => {
    it('cancels a submission using communityId from the request body', async () => {
      cancelSubmissionMock.mockResolvedValue(undefined);

      const req = makeRequest('/api/v1/esign/submissions/12/cancel', {
        method: 'POST',
        body: JSON.stringify({ communityId: 1 }),
        headers: { 'content-type': 'application/json', 'x-request-id': 'req-999' },
      });
      const context = makeRouteParams({ id: '12' });

      const response = await cancelPOST(req, context);
      const json = await response.json();

      expect(json.data.success).toBe(true);
      expect(cancelSubmissionMock).toHaveBeenCalledWith(1, 'user-1', 12, 'req-999');
    });
  });

  // =========================================================================
  // Remind POST route
  // =========================================================================

  describe('POST /api/v1/esign/submissions/[id]/remind', () => {
    it('passes submissionId from URL params to sendReminder service', async () => {
      sendReminderMock.mockResolvedValue(undefined);

      const body = { communityId: 1, signerId: 42 };
      const req = makeRequest('/api/v1/esign/submissions/10/remind', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json', 'x-request-id': 'req-456' },
      });
      const context = makeRouteParams({ id: '10' });

      const response = await remindPOST(req, context);
      const json = await response.json();

      expect(json.data.success).toBe(true);
      // Verify submissionId (10) is passed from URL params
      expect(sendReminderMock).toHaveBeenCalledWith(1, 'user-1', 10, 42, 'req-456');
    });

    it('checks write permission before sending reminder', async () => {
      sendReminderMock.mockResolvedValue(undefined);

      const body = { communityId: 1, signerId: 1 };
      const req = makeRequest('/api/v1/esign/submissions/5/remind', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      });
      const context = makeRouteParams({ id: '5' });

      await remindPOST(req, context);

      expect(requireEsignWritePermissionMock).toHaveBeenCalledWith(defaultMembership);
    });

    it('rejects invalid submission ID (NaN)', async () => {
      const body = { communityId: 1, signerId: 1 };
      const req = makeRequest('/api/v1/esign/submissions/abc/remind', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      });
      const context = makeRouteParams({ id: 'abc' });

      await expect(remindPOST(req, context)).rejects.toThrow('Invalid ID');
    });

    it('rejects missing signerId in body', async () => {
      const body = { communityId: 1 }; // signerId missing
      const req = makeRequest('/api/v1/esign/submissions/10/remind', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      });
      const context = makeRouteParams({ id: '10' });

      await expect(remindPOST(req, context)).rejects.toThrow();
    });
  });

  // =========================================================================
  // Template PDF preview route
  // =========================================================================

  describe('GET /api/v1/esign/templates/[id]/pdf', () => {
    it('returns presigned URL for template with sourceDocumentPath', async () => {
      const presignedUrl = 'https://supabase.storage/signed-url?token=xyz';
      createPresignedDownloadUrlMock.mockResolvedValue(presignedUrl);

      getTemplateMock.mockResolvedValue({
        id: 5,
        name: 'Violation Acknowledgment',
        sourceDocumentPath: 'communities/1/esign/violation-ack.pdf',
      });

      const req = makeRequest('/api/v1/esign/templates/5/pdf?communityId=1');
      const context = makeRouteParams({ id: '5' });

      const response = await templatePdfGET(req, context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data.pdfUrl).toBe(presignedUrl);
      expect(createPresignedDownloadUrlMock).toHaveBeenCalledWith(
        'documents',
        'communities/1/esign/violation-ack.pdf',
      );
      expect(requireEsignReadPermissionMock).toHaveBeenCalled();
    });

    it('returns 404 when template has no sourceDocumentPath', async () => {
      getTemplateMock.mockResolvedValue({
        id: 5,
        name: 'Empty Template',
        sourceDocumentPath: null,
      });

      const req = makeRequest('/api/v1/esign/templates/5/pdf?communityId=1');
      const context = makeRouteParams({ id: '5' });

      const response = await templatePdfGET(req, context);
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error.code).toBe('NOT_FOUND');
      expect(createPresignedDownloadUrlMock).not.toHaveBeenCalled();
    });

    it('returns 404 when presigned URL generation fails', async () => {
      createPresignedDownloadUrlMock.mockRejectedValue(new Error('Object not found'));

      getTemplateMock.mockResolvedValue({
        id: 5,
        name: 'Template',
        sourceDocumentPath: 'communities/1/esign/missing.pdf',
      });

      const req = makeRequest('/api/v1/esign/templates/5/pdf?communityId=1');
      const context = makeRouteParams({ id: '5' });

      const response = await templatePdfGET(req, context);
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error.code).toBe('NOT_FOUND');
    });

    it('rejects invalid template ID', async () => {
      const req = makeRequest('/api/v1/esign/templates/abc/pdf?communityId=1');
      const context = makeRouteParams({ id: 'abc' });

      await expect(templatePdfGET(req, context)).rejects.toThrow('Invalid ID');
    });
  });
});
