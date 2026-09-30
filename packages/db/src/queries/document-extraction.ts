import { and, eq, sql, type SQL } from 'drizzle-orm';
import { createScopedClient } from '../scoped-client';
import { documents } from '../schema/documents';

export type DocumentExtractionCompletionStatus = 'completed' | 'skipped';

export interface DocumentExtractionSuccessParams {
  communityId: number;
  documentId: number;
  text: string;
  status: DocumentExtractionCompletionStatus;
  /**
   * The storage path the text was extracted from. When given, the row is only
   * updated while it still points at that file: replacing a document's file
   * keeps its id, so an extraction of the OLD file that finishes after the
   * replace would otherwise overwrite the new file's search text.
   */
  filePath?: string;
}

export interface DocumentExtractionFailureParams {
  communityId: number;
  documentId: number;
  errorMessage: string;
  /** See {@link DocumentExtractionSuccessParams.filePath}. */
  filePath?: string;
}

function extractionTarget(documentId: number, filePath: string | undefined): SQL {
  const byId = eq(documents.id, documentId);
  return filePath === undefined ? byId : (and(byId, eq(documents.filePath, filePath)) as SQL);
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
    extractionTarget(params.documentId, params.filePath),
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
    extractionTarget(params.documentId, params.filePath),
  );
}
