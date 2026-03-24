import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { BadRequestError, ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { createPresignedDownloadUrl } from '@propertypro/db';
import type { SubmitSignatureInput } from '@/lib/services/esign-service';
import {
  getSignerContext,
  submitSignature,
  declineSigning,
} from '@/lib/services/esign-service';

/**
 * Token-authenticated signing route.
 * External signers access this via a unique slug — no session auth required.
 */

const submitSignatureSchema = z.object({
  signedValues: z
    .record(
      z.string(),
      z.object({
        fieldId: z.string(),
        type: z.enum(['signature', 'initials', 'date', 'text', 'checkbox']),
        value: z.string(),
        signedAt: z.string().datetime(),
      }),
    )
    .refine(
      (value) => Object.keys(value).length > 0,
      'At least one signed field is required',
    ),
  consentGiven: z.literal(true),
});

const declineSchema = z.object({
  action: z.literal('decline'),
  reason: z.string().max(2000).optional(),
});

export const GET = withErrorHandler(
  async (_req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const submissionExternalId = params?.submissionExternalId;
    const slug = params?.slug;
    if (!slug) throw new BadRequestError('Missing signing slug');
    if (!submissionExternalId) throw new BadRequestError('Missing submission ID');

    const signerContext = await getSignerContext(slug, submissionExternalId);

    // Filter template fields to only those for this signer's role
    const signerFields = signerContext.template.fieldsSchema?.fields.filter(
      (f) => f.signerRole === signerContext.signer.role,
    ) ?? [];

    // Generate presigned URL for the source PDF — never expose internal storage paths
    let pdfUrl: string | null = null;
    if (signerContext.template.sourceDocumentPath) {
      try {
        pdfUrl = await createPresignedDownloadUrl(
          'documents',
          signerContext.template.sourceDocumentPath,
        );
      } catch {
        // PDF may not exist yet (template without uploaded document)
        pdfUrl = null;
      }
    }

    return NextResponse.json({
      data: {
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
      },
    });
  },
);

export const POST = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const submissionExternalId = params?.submissionExternalId;
    const slug = params?.slug;
    if (!slug) throw new BadRequestError('Missing signing slug');
    if (!submissionExternalId) throw new BadRequestError('Missing submission ID');

    const body: unknown = await req.json();

    // Check if this is a decline action
    const declineResult = declineSchema.safeParse(body);
    if (declineResult.success) {
      const result = await declineSigning(
        slug,
        declineResult.data.reason,
        submissionExternalId,
      );
      return NextResponse.json({ data: result });
    }

    // Otherwise, treat as a signature submission
    const parseResult = submitSignatureSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid signature payload', {
        fields: formatZodErrors(parseResult.error),
      });
    }

    const ipAddress =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const userAgent = req.headers.get('user-agent') ?? 'unknown';

    const result = await submitSignature(
      slug,
      {
        signedValues: parseResult.data.signedValues as SubmitSignatureInput['signedValues'],
        consentGiven: parseResult.data.consentGiven,
      },
      ipAddress,
      userAgent,
      submissionExternalId,
    );

    return NextResponse.json({ data: result });
  },
);
