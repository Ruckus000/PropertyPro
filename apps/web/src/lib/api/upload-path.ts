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
 */
export function validateUploadFilePath(
  filePath: string,
  effectiveCommunityId: number,
): void {
  if (filePath.includes('..')) {
    throw new ValidationError('Invalid file path', {
      fields: [{ field: 'filePath', message: 'Path traversal is not allowed' }],
    });
  }
  const expectedPrefix = `communities/${effectiveCommunityId}/`;
  if (!filePath.startsWith(expectedPrefix)) {
    throw new ValidationError('Invalid file path', {
      fields: [{ field: 'filePath', message: `filePath must start with ${expectedPrefix}` }],
    });
  }
}
