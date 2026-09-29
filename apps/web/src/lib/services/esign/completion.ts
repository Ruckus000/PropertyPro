/**
 * E-sign service — Completion logic (internal — not re-exported by the barrel).
 *
 * Moved verbatim from `esign-service.ts` (SVC-08), which remains the public
 * entry point and re-exports this module's public names. Import from
 * `@/lib/services/esign-service`, not from here.
 */
import {
  createScopedClient,
  esignEvents,
  esignSigners,
  esignSubmissions,
  esignTemplates,
} from '@propertypro/db';
import { and, eq } from '@propertypro/db/filters';
import { type EsignFieldsSchema, type EsignSubmissionStatus } from '@propertypro/shared';
import { flattenSignedPdf, computeDocumentHash, uploadSignedDocument } from '../esign-pdf-service';
import { type EsignTemplateRecord } from './types';

// ---------------------------------------------------------------------------
// Completion logic (internal)
// ---------------------------------------------------------------------------

interface SubmissionCompletionResult {
  status: Extract<
    EsignSubmissionStatus,
    'pending' | 'processing' | 'completed' | 'processing_failed'
  >;
  message?: string;
}

export async function checkAndCompleteSubmission(
  communityId: number,
  submissionId: number,
): Promise<SubmissionCompletionResult> {
  const scoped = createScopedClient(communityId);

  const signerRows = await scoped.selectFrom(
    esignSigners,
    {},
    eq(esignSigners.submissionId, submissionId),
  );

  if (signerRows.length === 0) {
    return { status: 'pending' };
  }

  const allCompleted = signerRows.every(
    (s) => (s as Record<string, unknown>).status === 'completed',
  );
  if (!allCompleted) {
    return { status: 'pending' };
  }

  // Atomic guard: only one concurrent caller can claim the finalization slot
  const guardRows = await scoped.update(
    esignSubmissions,
    { status: 'processing', updatedAt: new Date() },
    and(eq(esignSubmissions.id, submissionId), eq(esignSubmissions.status, 'pending')),
  );

  const sub = guardRows[0] as Record<string, unknown> | undefined;
  if (!sub) {
    const currentRows = await scoped.selectFrom(
      esignSubmissions,
      {},
      eq(esignSubmissions.id, submissionId),
    );
    const currentStatus = (currentRows[0] as Record<string, unknown> | undefined)
      ?.status;

    if (
      currentStatus === 'processing' ||
      currentStatus === 'completed' ||
      currentStatus === 'processing_failed'
    ) {
      return {
        status: currentStatus,
      } as SubmissionCompletionResult;
    }

    return { status: 'pending' };
  }

  // Flatten against what the request was SENT with. This used to re-read the
  // template live, minutes to days after the signer saw the fields, so a
  // template edited in between produced a signed PDF whose boxes did not match
  // the document anyone actually signed.
  const templateId = sub.templateId as number | null;
  const tplRows =
    templateId != null
      ? await scoped.selectFrom(esignTemplates, {}, eq(esignTemplates.id, templateId))
      : [];

  const tpl = tplRows[0] as EsignTemplateRecord | undefined;
  const finalSchema =
    (sub.fieldsSchema as EsignFieldsSchema | null) ?? tpl?.fieldsSchema ?? null;
  const finalSourcePath =
    (sub.sourceDocumentPath as string | null) ?? tpl?.sourceDocumentPath ?? null;
  const documentName = (sub.messageSubject as string | null) ?? tpl?.name ?? 'document';

  if (!finalSchema || !finalSourcePath || finalSourcePath.trim().length === 0) {
    const message =
      'The signed document could not be finalized because the source PDF is unavailable.';

    await scoped.update(
      esignSubmissions,
      { status: 'processing_failed', updatedAt: new Date() },
      eq(esignSubmissions.id, submissionId),
    );

    await scoped.insert(esignEvents, {
      communityId,
      submissionId,
      eventType: 'submission_processing_failed',
      eventData: { message },
    });

    return { status: 'processing_failed', message };
  }

  try {
    const signers = signerRows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        role: row.role as string,
        signed_values: row.signedValues as Record<string, { fieldId: string; type: string; value: string; signedAt: string }> | null,
      };
    });

    const pdfBytes = await flattenSignedPdf(finalSourcePath, signers, finalSchema);

    const hash = computeDocumentHash(pdfBytes);
    const safeName = documentName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const storagePath = await uploadSignedDocument(communityId, submissionId, pdfBytes, `${safeName}_signed.pdf`);

    await scoped.update(
      esignSubmissions,
      {
        status: 'completed',
        completedAt: new Date(),
        documentHash: hash,
        signedDocumentPath: storagePath,
        updatedAt: new Date(),
      },
      eq(esignSubmissions.id, submissionId),
    );

    await scoped.insert(esignEvents, {
      communityId,
      submissionId,
      eventType: 'submission_completed',
      eventData: { documentHash: hash, signerCount: signerRows.length },
    });

    return { status: 'completed' };
  } catch (error) {
    console.error('[esign-service] failed to finalize submission', {
      submissionId,
      error: error instanceof Error ? error.message : String(error),
    });

    const message =
      'The signature was captured, but we could not finalize the signed document.';

    await scoped.update(
      esignSubmissions,
      { status: 'processing_failed', updatedAt: new Date() },
      eq(esignSubmissions.id, submissionId),
    );

    await scoped.insert(esignEvents, {
      communityId,
      submissionId,
      eventType: 'submission_processing_failed',
      eventData: {
        message,
        error: error instanceof Error ? error.message : String(error),
      },
    });

    return { status: 'processing_failed', message };
  }
}
