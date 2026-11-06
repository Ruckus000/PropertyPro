/**
 * Bulk Document Upload API — create document records across multiple communities.
 *
 * POST /api/v1/pm/bulk/documents
 *
 * Plan A1 drain #169. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`.
 *
 * Authorization: caller must hold a PM-scope role (property_manager or
 * root_manager) in at least one community — the isPmAdminInAnyCommunity gate.
 * Each communityId in the request is validated against the user's managed set.
 *
 * Note: Files must already be uploaded to Supabase Storage via POST /api/v1/upload
 * before calling this endpoint. This route creates the document DB records for each
 * target community referencing the shared storage path, so that path must sit in
 * the `documents/` folder of one of the target communities.
 */
import { runRoute } from '@propertypro/api-contract';
// AUTHZ: PM portfolio route — cross-community aggregation by design.
import { findManagedCommunitiesPortfolioUnscoped } from '@propertypro/db/unsafe';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { requirePmPortfolioAccess } from '@/lib/api/pm-portfolio-access';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { readValidatedUpload } from '@/lib/documents/create-uploaded-document';
import { REDACTION_ATTESTATION_TEXT } from '@/lib/documents/redaction-attestation-text';
import { insertBulkDocumentsForCommunity, type BulkDocumentInput } from '@/lib/pm/bulk-document-upload';
import { assertCommunityOwnedStoragePath } from '@/lib/services/storage-validators';
import { pmBulkDocumentsPostContract } from './contract';

interface DocumentResult {
  communityId: number;
  communityName: string;
  status: 'created' | 'failed';
  documentsCreated?: number;
  error?: string;
}

export const POST = withErrorHandler(
  runRoute(pmBulkDocumentsPostContract, async ({ body, req }) => {
    const userId = await requirePmPortfolioAccess(
      req,
      'Only property managers can perform bulk document uploads',
    );

    const { communityIds, documents: docPayloads, redactionAttested } = body;

    const managed = await findManagedCommunitiesPortfolioUnscoped(userId);
    const managedMap = new Map(managed.map((c) => [c.communityId, c.communityName]));

    const invalidIds = communityIds.filter((id) => !managedMap.has(id));
    if (invalidIds.length > 0) {
      throw new ForbiddenError(
        `You do not manage communities: ${invalidIds.join(', ')}`,
      );
    }

    // Bulk files carry no category, so every one needs the attestation. Refused
    // here, as a 400, rather than as N failed communities.
    if (redactionAttested !== true) {
      throw new ValidationError(
        'Confirm you have redacted protected personal information before uploading.',
        { fields: [{ field: 'redactionAttested', message: REDACTION_ATTESTATION_TEXT }] },
      );
    }

    // Everything that can refuse a file runs here, before any community is
    // written: a bad file fails the request instead of half a batch, and each
    // file is read once rather than once per selected community.
    //
    // ponytail: every selected community's row points at ONE object under the
    // uploading community's prefix. Safe because nothing deletes `documents`
    // objects (cleanup.ts keeps them past a purge). Trigger: anything that
    // deletes `documents` objects by community prefix, which must then copy
    // per community the way esign/documents/from-library does.
    const docs: BulkDocumentInput[] = [];
    for (const doc of docPayloads) {
      const ownerId = communityIds.find((id) => doc.storagePath.startsWith(`communities/${id}/documents/`));
      if (ownerId === undefined) {
        throw new ValidationError('Storage path does not belong to a selected community.', {
          fields: { storagePath: 'Path must start with communities/<a selected community>/documents/' },
        });
      }
      assertCommunityOwnedStoragePath(doc.storagePath, ownerId, 'documents', 'storagePath');
      const measured = await readValidatedUpload({
        userId,
        communityId: ownerId,
        filePath: doc.storagePath,
        fileName: doc.fileName,
        fileSize: doc.fileSize,
      });
      docs.push({ ...doc, measured });
    }

    const results = await Promise.allSettled(
      communityIds.map(async (communityId): Promise<DocumentResult> => {
        await assertNotDemoGrace(communityId);
        await requireActiveSubscriptionForMutation(communityId);
        const communityName = managedMap.get(communityId) ?? `Community ${communityId}`;
        const { created } = await insertBulkDocumentsForCommunity({
          communityId,
          uploadedBy: userId,
          docs,
        });

        return {
          communityId,
          communityName,
          status: 'created',
          documentsCreated: created,
        };
      }),
    );

    const mapped: DocumentResult[] = results.map((result, idx) => {
      const communityId = communityIds[idx]!;
      const communityName = managedMap.get(communityId) ?? `Community ${communityId}`;

      if (result.status === 'fulfilled') {
        return result.value;
      }

      return {
        communityId,
        communityName,
        status: 'failed' as const,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      };
    });

    return { results: mapped };
  }),
);
