/**
 * Token-authenticated signing route.
 * External signers access this via a unique slug — no session auth required.
 *
 * Plan A1 drain #176 — migrated to `runRoute(contract, handler)`; see `./contract.ts`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { createPresignedDownloadUrl } from '@propertypro/db';
import type { SubmitSignatureInput } from '@/lib/services/esign-service';
import {
  getSignerContext,
  submitSignature,
  declineSigning,
} from '@/lib/services/esign-service';
import { esignSignGetContract, esignSignPostContract } from './contract';

export const GET = withErrorHandler(
  runRoute(esignSignGetContract, async ({ params }) => {
    const signerContext = await getSignerContext(
      params.slug,
      params.submissionExternalId,
    );

    const signerFields = signerContext.template.fieldsSchema?.fields.filter(
      (f) => f.signerRole === signerContext.signer.role,
    ) ?? [];

    let pdfUrl: string | null = null;
    if (signerContext.template.sourceDocumentPath) {
      try {
        pdfUrl = await createPresignedDownloadUrl(
          'documents',
          signerContext.template.sourceDocumentPath,
        );
      } catch {
        pdfUrl = null;
      }
    }

    return {
      signer: {
        id: signerContext.signer.id,
        externalId: signerContext.signer.externalId,
        email: signerContext.signer.email,
        name: signerContext.signer.name,
        role: signerContext.signer.role,
        status: signerContext.signer.status,
      },
      submission: {
        externalId: signerContext.submission.externalId,
        status: signerContext.submission.status,
        effectiveStatus: signerContext.submission.effectiveStatus,
        messageSubject: signerContext.submission.messageSubject,
        messageBody: signerContext.submission.messageBody,
        expiresAt: signerContext.submission.expiresAt,
      },
      template: {
        name: signerContext.template.name,
        description: signerContext.template.description,
      },
      pdfUrl,
      fields: signerFields,
      isWaiting: signerContext.isWaiting,
      waitingFor: signerContext.waitingFor,
    };
  }),
);

export const POST = withErrorHandler(
  runRoute(esignSignPostContract, async ({ params, body, req }) => {
    if ('action' in body && body.action === 'decline') {
      return declineSigning(
        params.slug,
        body.reason,
        params.submissionExternalId,
      );
    }

    const ipAddress =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const userAgent = req.headers.get('user-agent') ?? 'unknown';

    const submitBody = body as {
      signedValues: SubmitSignatureInput['signedValues'];
      consentGiven: true;
    };

    return submitSignature(
      params.slug,
      {
        signedValues: submitBody.signedValues,
        consentGiven: submitBody.consentGiven,
      },
      ipAddress,
      userAgent,
      params.submissionExternalId,
    );
  }),
);
