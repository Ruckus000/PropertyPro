/**
 * E-sign service — Signing flow (token-authenticated).
 *
 * Moved verbatim from `esign-service.ts` (SVC-08), which remains the public
 * entry point and re-exports this module's public names. Import from
 * `@/lib/services/esign-service`, not from here.
 */
import {
  createScopedClient,
  esignConsent,
  esignEvents,
  esignSigners,
  esignSubmissions,
  esignTemplates,
} from '@propertypro/db';
import {
  and,
  eq,
  isNull,
  lt,
  or,
} from '@propertypro/db/filters';
// AUTHZ: Public e-sign links are authorized by possession of submissionExternalId + signer slug and must resolve across tenants before any community context exists.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { ESIGN_CONSENT_TEXT, type EsignFieldsSchema } from '@propertypro/shared';
import { NotFoundError, UnprocessableEntityError } from '@/lib/api/errors';
import {
  type EsignSignerRecord,
  type EsignSubmissionRecord,
  type EsignTemplateRecord,
  type SubmitSignatureInput,
  type SubmitSignatureResult,
} from './types';
import { validateSignedValuesForSigner, withEffectiveStatus } from './helpers';
import { checkAndCompleteSubmission } from './completion';

// ---------------------------------------------------------------------------
// Signing flow (token-authenticated — admin client for unscoped SELECTs, scoped client for mutations)
// ---------------------------------------------------------------------------

export async function getSignerContext(
  slug: string,
  expectedSubmissionExternalId?: string,
): Promise<{
  signer: EsignSignerRecord;
  submission: EsignSubmissionRecord;
  /** Null for a one-off send, which has no template. */
  template: EsignTemplateRecord | null;
  /**
   * The layout this request was sent with — the submission's own snapshot,
   * falling back to the template for rows written before migration 0063.
   * Resolved once here so every signing-time consumer agrees.
   */
  fieldsSchema: EsignFieldsSchema | null;
  /** The PDF this request was sent with, resolved the same way. */
  sourceDocumentPath: string | null;
  isWaiting: boolean;
  waitingFor: string | null;
}> {
  // Authorization contract: this unauthenticated public read is gated by
  // possession of the signing-link token pair (submissionExternalId + slug).
  // That token is the authorization boundary, so this lookup must bypass
  // tenant scoping and resolve directly against the app database.
  const db = createUnscopedClient();

  const signerRows = await db
    .select()
    .from(esignSigners)
    .where(and(eq(esignSigners.slug, slug), isNull(esignSigners.deletedAt)))
    .limit(1);

  if (signerRows.length === 0) {
    throw new NotFoundError('Invalid or expired signing link');
  }

  const signer = { ...(signerRows[0] as EsignSignerRecord) };

  const subRows = await db
    .select()
    .from(esignSubmissions)
    .where(and(eq(esignSubmissions.id, signer.submissionId), isNull(esignSubmissions.deletedAt)))
    .limit(1);

  if (subRows.length === 0) {
    throw new NotFoundError('Submission not found');
  }

  const submission = withEffectiveStatus({
    ...(subRows[0] as EsignSubmissionRecord),
  });

  if (
    expectedSubmissionExternalId &&
    submission.externalId !== expectedSubmissionExternalId
  ) {
    throw new NotFoundError('Invalid or expired signing link');
  }

  const tplRows =
    submission.templateId != null
      ? await db
          .select()
          .from(esignTemplates)
          .where(
            and(
              eq(esignTemplates.id, submission.templateId),
              isNull(esignTemplates.deletedAt),
            ),
          )
          .limit(1)
      : [];

  const template =
    tplRows.length > 0 ? { ...(tplRows[0] as EsignTemplateRecord) } : null;

  // Prefer what the request was sent with; fall back to the template only for
  // rows written before the snapshot existed.
  const fieldsSchema = submission.fieldsSchema ?? template?.fieldsSchema ?? null;
  const sourceDocumentPath =
    submission.sourceDocumentPath ?? template?.sourceDocumentPath ?? null;

  // A link with nothing to render: no snapshot, and the template it pointed at
  // is gone. Signing cannot proceed, and saying so beats a blank document.
  if (!fieldsSchema) {
    throw new NotFoundError('Template not found');
  }

  // Check sequential signing
  let isWaiting = false;
  let waitingFor: string | null = null;

  if (submission.signingOrder === 'sequential') {
    const priorSigners = await db
      .select({
        name: esignSigners.name,
        status: esignSigners.status,
        sortOrder: esignSigners.sortOrder,
      })
      .from(esignSigners)
      .where(
        and(
          eq(esignSigners.submissionId, signer.submissionId),
          eq(esignSigners.communityId, signer.communityId),
          isNull(esignSigners.deletedAt),
          lt(esignSigners.sortOrder, signer.sortOrder),
        ),
      );

    const incompleteSigners = priorSigners.filter(
      (candidate) => candidate.status !== 'completed',
    );

    if (incompleteSigners.length > 0) {
      const priorSigner = incompleteSigners.sort((left, right) => left.sortOrder - right.sortOrder)[0];
      isWaiting = true;
      waitingFor = priorSigner?.name ?? 'a previous signer';
    }
  }

  // Mark as opened if first access — use scoped client for mutations
  const isActiveSubmission = submission.effectiveStatus === 'pending';
  const isTerminalSignerState =
    signer.status === 'completed' || signer.status === 'declined';

  if (!isWaiting && isActiveSubmission && !isTerminalSignerState && signer.status === 'pending') {
    const scoped = createScopedClient(signer.communityId);

    await scoped.update(
      esignSigners,
      { status: 'opened', openedAt: new Date() },
      eq(esignSigners.id, signer.id),
    );

    await scoped.insert(esignEvents, {
      communityId: signer.communityId,
      submissionId: signer.submissionId,
      signerId: signer.id,
      eventType: 'opened',
      eventData: {},
    });

    signer.status = 'opened';
  }

  return {
    signer,
    submission,
    template,
    fieldsSchema,
    sourceDocumentPath,
    isWaiting,
    waitingFor,
  };
}

function assertSignerContextCanAct(
  context: Awaited<ReturnType<typeof getSignerContext>>,
): void {
  const { signer, submission, isWaiting } = context;

  if (signer.status === 'completed') {
    throw new UnprocessableEntityError('You have already signed this document');
  }
  if (signer.status === 'declined') {
    throw new UnprocessableEntityError('You have declined to sign this document');
  }
  if (submission.effectiveStatus === 'cancelled') {
    throw new UnprocessableEntityError('This signing request has been cancelled');
  }
  if (submission.effectiveStatus === 'expired') {
    throw new UnprocessableEntityError('This signing request has expired');
  }
  if (isWaiting) {
    throw new UnprocessableEntityError(
      'This signing request is waiting for a previous signer to complete first',
    );
  }
}

export async function submitSignature(
  slug: string,
  input: SubmitSignatureInput,
  ipAddress: string,
  userAgent: string,
  expectedSubmissionExternalId?: string,
): Promise<SubmitSignatureResult> {
  const context = await getSignerContext(
    slug,
    expectedSubmissionExternalId,
  );
  assertSignerContextCanAct(context);
  const { signer, fieldsSchema } = context;

  validateSignedValuesForSigner(signer, fieldsSchema, input.signedValues);

  const scoped = createScopedClient(signer.communityId);

  // Atomic guard: only proceed if signer is still pending/opened (prevents double-sign race)
  const updated = await scoped.update(
    esignSigners,
    {
      signedValues: input.signedValues,
      status: 'completed',
      completedAt: new Date(),
    },
    and(
      eq(esignSigners.id, signer.id),
      or(eq(esignSigners.status, 'pending'), eq(esignSigners.status, 'opened')),
    ),
  );

  if (updated.length === 0) {
    throw new UnprocessableEntityError('You have already signed this document');
  }

  await scoped.insert(esignEvents, {
    communityId: signer.communityId,
    submissionId: signer.submissionId,
    signerId: signer.id,
    eventType: 'signer_completed',
    eventData: { fieldCount: Object.keys(input.signedValues).length },
    ipAddress,
    userAgent,
  });

  // Dual-path consent (§2.2)
  if (signer.userId) {
    const existing = await scoped.selectFrom(
      esignConsent,
      {},
      and(eq(esignConsent.userId, signer.userId), isNull(esignConsent.revokedAt)),
    );

    if (existing.length === 0) {
      await scoped.insert(esignConsent, {
        communityId: signer.communityId,
        userId: signer.userId,
        consentGiven: true,
        consentText: ESIGN_CONSENT_TEXT,
        ipAddress,
        userAgent,
      });
    }
  }

  await scoped.insert(esignEvents, {
    communityId: signer.communityId,
    submissionId: signer.submissionId,
    signerId: signer.id,
    eventType: 'consent_given',
    eventData: { consentText: ESIGN_CONSENT_TEXT },
    ipAddress,
    userAgent,
  });

  const completionResult = await checkAndCompleteSubmission(
    signer.communityId,
    signer.submissionId,
  );

  if (completionResult.status === 'processing_failed') {
    return {
      success: false,
      signerStatus: 'completed',
      submissionStatus: completionResult.status,
      message:
        completionResult.message ??
        'Your signature was captured, but the signed document could not be finalized.',
    };
  }

  if (completionResult.status === 'processing') {
    return {
      success: true,
      signerStatus: 'completed',
      submissionStatus: completionResult.status,
      message:
        'Your signature was captured and the signed document is still being finalized.',
    };
  }

  return {
    success: true,
    signerStatus: 'completed',
    submissionStatus: completionResult.status,
  };
}

export async function declineSigning(
  slug: string,
  reason?: string,
  expectedSubmissionExternalId?: string,
): Promise<{ success: boolean }> {
  const context = await getSignerContext(slug, expectedSubmissionExternalId);
  assertSignerContextCanAct(context);
  const { signer } = context;
  const scoped = createScopedClient(signer.communityId);

  await scoped.update(
    esignSigners,
    { status: 'declined' },
    eq(esignSigners.id, signer.id),
  );

  await scoped.update(
    esignSubmissions,
    { status: 'declined' },
    eq(esignSubmissions.id, signer.submissionId),
  );

  await scoped.insert(esignEvents, {
    communityId: signer.communityId,
    submissionId: signer.submissionId,
    signerId: signer.id,
    eventType: 'declined',
    eventData: { reason: reason ?? null },
  });

  return { success: true };
}
