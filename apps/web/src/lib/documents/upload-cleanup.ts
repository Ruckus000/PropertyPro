/**
 * Reclaiming storage bytes when the metadata write never lands.
 *
 * Uploading is two-phase and only the first phase is durable.
 * `POST /api/v1/upload` presigns a path and creates NO row — the `documentId`
 * it returns is a `crypto.randomUUID()` that only namespaces the path. The
 * browser PUTs the bytes. Only then does the metadata route write the row. If
 * that last step throws, the object exists and nothing in the database knows.
 * Nothing reclaims it afterwards: no cron, no script, no bucket lifecycle rule,
 * and this bucket is deliberately permanent. `pnpm documents:orphan-report`
 * measures what has already accumulated.
 *
 * ## Two rules, both load-bearing
 *
 * **1. Never delete before authorization.** `validateUploadFilePath` proves only
 * that the path is under `communities/{id}/`, and it runs BEFORE
 * `requireCommunityMembership`. Cleaning up any earlier than the membership +
 * permission gates would hand an unauthorized caller a delete primitive: POST a
 * crafted `filePath`, fail a gate on purpose, and the object is gone. Callers
 * must open `withUploadCleanup` only after those gates pass — and
 * `deleteUnreferencedUpload` re-checks the path scope itself rather than
 * trusting that they did.
 *
 * **2. Never delete something a row points at.** This is not belt-and-braces;
 * it closes a bug that was live before this module existed. `rejectInvalidUpload`
 * used to call `deleteStorageObject` directly with no reference check, so a
 * member of the community holding `documents:write` could POST an EXISTING
 * document's `file_path` with a deliberately wrong `fileSize`, trip the
 * size-mismatch branch, and destroy that document's bytes — leaving the row
 * behind, pointing at nothing, every download 404ing forever. Same community
 * only, and such a member can already soft-delete documents; the difference is
 * that soft delete is recoverable and this was not.
 *
 * Rule 2 is also what makes it safe to wrap the INSERT itself: once the row
 * exists it references the path, so a post-insert failure (an audit-log throw,
 * say) finds the object referenced and declines. No boundary juggling required.
 *
 * ## Never throws
 *
 * `deleteUnreferencedUpload` reports its outcome instead of raising, and
 * `withUploadCleanup` rethrows the ORIGINAL error unchanged. A cleanup failure
 * must not turn the redaction-attestation 400 — the message the uploader needs
 * in order to fix their upload — into a 500 that says nothing.
 */
import { deleteStorageObject } from '@propertypro/db';
import { isUploadFilePathScoped } from '@/lib/api/upload-path';
import { isFilePathReferenced } from '@/lib/services/documents-service';

export const DOCUMENTS_BUCKET_NAME = 'documents';

export type UploadCleanupReason =
  /** The object was unreferenced and has been removed. */
  | 'deleted'
  /** A `documents` row points at this path — left alone. */
  | 'referenced'
  /** The path is not scoped to this community, or contains traversal. */
  | 'refused'
  /** The reference check or the delete itself threw. */
  | 'failed';

export interface UploadCleanupOutcome {
  reason: UploadCleanupReason;
  error?: string;
}

function stringifyUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Delete an uploaded object, but only if nothing has a record of it.
 *
 * Never throws. See the module header for why each check is here and what
 * breaks without it.
 */
export async function deleteUnreferencedUpload(
  communityId: number,
  filePath: string,
): Promise<UploadCleanupOutcome> {
  if (!isUploadFilePathScoped(filePath, communityId)) {
    // eslint-disable-next-line no-console
    console.error('[documents] refused to clean up an out-of-scope upload path', {
      communityId,
      filePath,
    });
    return { reason: 'refused' };
  }

  try {
    if (await isFilePathReferenced(communityId, filePath)) {
      return { reason: 'referenced' };
    }
  } catch (error) {
    // Fail CLOSED. If the reference check cannot run we do not know whether the
    // object is a record, and "delete when unsure" is the wrong default for a
    // destructive, irreversible operation on an association's files.
    const message = stringifyUnknownError(error);
    // eslint-disable-next-line no-console
    console.error('[documents] could not check whether an upload is referenced; left it alone', {
      communityId,
      filePath,
      error: message,
    });
    return { reason: 'failed', error: message };
  }

  try {
    await deleteStorageObject(DOCUMENTS_BUCKET_NAME, filePath);
    return { reason: 'deleted' };
  } catch (error) {
    const message = stringifyUnknownError(error);
    // eslint-disable-next-line no-console
    console.error('[documents] failed to clean up an unreferenced upload', {
      communityId,
      filePath,
      error: message,
    });
    return { reason: 'failed', error: message };
  }
}

/**
 * Run `fn`; if it throws, reclaim the uploaded object and rethrow the original
 * error unchanged.
 *
 * Open this only AFTER the membership and permission gates — rule 1 in the
 * module header.
 */
export async function withUploadCleanup<T>(
  communityId: number,
  filePath: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    await deleteUnreferencedUpload(communityId, filePath);
    throw error;
  }
}
