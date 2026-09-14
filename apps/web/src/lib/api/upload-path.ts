import { ValidationError } from '@/lib/api/errors';

/**
 * Validates an attacker-supplied upload `filePath` against the authoritative
 * `effectiveCommunityId` resolved from the request context (NOT from the
 * request body, which the client controls).
 *
 * Rejects two attacks:
 *   1. Cross-tenant writes: e.g. caller submits `communityId: X` in the body
 *      but tenant context resolves to community Y; the path must match Y.
 *   2. Path traversal: any `..` segment in the path, even after a valid
 *      prefix (e.g. `communities/X/documents/../../communities/Y/...`).
 *
 * Call this in route handlers AFTER `resolveEffectiveCommunityId()` —
 * never in the Zod schema, where the authoritative id is not yet known.
 *
 * `bucketPrefix` is the storage namespace the path must live under; it
 * defaults to `communities` (documents/violations evidence) but callers on
 * other buckets pass their own (e.g. `maintenance`) so every upload path gets
 * the same traversal + cross-tenant checks instead of a divergent inline one.
 */
/**
 * The single decision both exports below are made of.
 *
 * One function rather than two copies of the same two conditions: the thrower
 * and the predicate must agree exactly, because one of them gates a 400 and the
 * other gates a DELETE. Two copies is the shape that let
 * `purgeCommunitySiteAssets` fall a kind behind its writer — the fix there was
 * to make the two the same list, not to lengthen one of them.
 */
function uploadPathScopeFailure(
  filePath: string,
  effectiveCommunityId: number,
  bucketPrefix: string,
): { reason: 'traversal' } | { reason: 'prefix'; expectedPrefix: string } | null {
  if (filePath.includes('..')) return { reason: 'traversal' };
  const expectedPrefix = `${bucketPrefix}/${effectiveCommunityId}/`;
  if (!filePath.startsWith(expectedPrefix)) return { reason: 'prefix', expectedPrefix };
  return null;
}

export function validateUploadFilePath(
  filePath: string,
  effectiveCommunityId: number,
  bucketPrefix = 'communities',
): void {
  const failure = uploadPathScopeFailure(filePath, effectiveCommunityId, bucketPrefix);
  if (!failure) return;

  throw new ValidationError('Invalid file path', {
    fields: [
      {
        field: 'filePath',
        message:
          failure.reason === 'traversal'
            ? 'Path traversal is not allowed'
            : `filePath must start with ${failure.expectedPrefix}`,
      },
    ],
  });
}

/**
 * The same decision as a predicate, for callers that must choose rather than
 * throw.
 *
 * Exists so `deleteUnreferencedUpload` can re-establish the property itself
 * instead of trusting that its caller already validated. A deleter whose safety
 * depends on an earlier line in a different file is one refactor away from
 * deleting the wrong tenant's object, and the check costs two string
 * comparisons.
 */
export function isUploadFilePathScoped(
  filePath: string,
  effectiveCommunityId: number,
  bucketPrefix = 'communities',
): boolean {
  return uploadPathScopeFailure(filePath, effectiveCommunityId, bucketPrefix) === null;
}
