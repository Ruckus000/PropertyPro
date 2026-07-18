/**
 * Bulk Document Upload API — create document records across multiple communities.
 *
 * POST /api/v1/pm/bulk/documents
 *
 * Plan A1 drain #169. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`.
 *
 * Authorization: caller must hold property_manager_admin in at least one community.
 * Each communityId in the request is validated against the user's managed set.
 *
 * Note: Files must already be uploaded to Supabase Storage via POST /api/v1/upload
 * before calling this endpoint. This route creates the document DB records for each
 * target community referencing the shared storage path.
 */
import { runRoute } from '@propertypro/api-contract';
// AUTHZ: PM portfolio route — cross-community aggregation by design.
import { findManagedCommunitiesPortfolioUnscoped } from '@propertypro/db/unsafe';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError } from '@/lib/api/errors';
import { requirePmPortfolioAccess } from '@/lib/api/pm-portfolio-access';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { insertBulkDocumentsForCommunity } from '@/lib/pm/bulk-document-upload';
import { pmBulkDocumentsPostContract } from './contract';

interface DocumentResult {
  communityId: number;
  communityName: string;
  status: 'created' | 'failed';
  documentsCreated?: number;
  error?: string;
}

export const POST = withErrorHandler(
  runRoute(pmBulkDocumentsPostContract, async ({ body }) => {
    const userId = await requirePmPortfolioAccess(
      'Only property managers can perform bulk document uploads',
    );

    const { communityIds, documents: docPayloads } = body;

    const managed = await findManagedCommunitiesPortfolioUnscoped(userId);
    const managedMap = new Map(managed.map((c) => [c.communityId, c.communityName]));

    const invalidIds = communityIds.filter((id) => !managedMap.has(id));
    if (invalidIds.length > 0) {
      throw new ForbiddenError(
        `You do not manage communities: ${invalidIds.join(', ')}`,
      );
    }

    const results = await Promise.allSettled(
      communityIds.map(async (communityId): Promise<DocumentResult> => {
        await assertNotDemoGrace(communityId);
        const communityName = managedMap.get(communityId) ?? `Community ${communityId}`;
        const { created } = await insertBulkDocumentsForCommunity({
          communityId,
          uploadedBy: userId,
          docs: docPayloads,
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
