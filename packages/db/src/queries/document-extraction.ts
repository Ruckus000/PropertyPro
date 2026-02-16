import { eq, sql } from 'drizzle-orm';
import { createScopedClient } from '../scoped-client';
import { documents } from '../schema/documents';

export type DocumentExtractionCompletionStatus = 'completed' | 'skipped';

export interface DocumentExtractionSuccessParams {
  communityId: number;
  documentId: number;
  text: string;
  status: DocumentExtractionCompletionStatus;
}

export interface DocumentExtractionFailureParams {
  communityId: number;
  documentId: number;
  errorMessage: string;
}

export async function updateDocumentExtractionSuccess(
  params: DocumentExtractionSuccessParams,
): Promise<void> {
  const scoped = createScopedClient(params.communityId);
  await scoped.update(
    documents,
    {
      searchText: params.text,
      searchVector: sql`to_tsvector('english', ${params.text})`,
      extractionStatus: params.status,
      extractionError: null,
      extractedAt: new Date(),
    },
    eq(documents.id, params.documentId),
  );
}

export async function updateDocumentExtractionFailure(
  params: DocumentExtractionFailureParams,
): Promise<void> {
  const scoped = createScopedClient(params.communityId);
  await scoped.update(
    documents,
    {
      extractionStatus: 'failed',
      extractionError: params.errorMessage,
    },
    eq(documents.id, params.documentId),
  );
}
