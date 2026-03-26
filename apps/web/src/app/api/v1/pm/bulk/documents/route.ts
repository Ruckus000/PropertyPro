/**
 * Bulk Document Upload API — create document records across multiple communities.
 *
 * POST /api/v1/pm/bulk/documents
 *
 * Authorization: caller must hold property_manager_admin in at least one community.
 * Each communityId in the request is validated against the user's managed set.
 *
 * Note: Files must already be uploaded to Supabase Storage via POST /api/v1/upload
 * before calling this endpoint. This route creates the document DB records for each
 * target community referencing the shared storage path.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createScopedClient,
  documents,
} from '@propertypro/db';
import {
  isPmAdminInAnyCommunity,
  findManagedCommunitiesPortfolioUnscoped,
} from '@propertypro/db/unsafe';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const documentItemSchema = z.object({
  fileName: z.string().min(1, 'File name is required'),
  storagePath: z.string().min(1, 'Storage path is required')
    .regex(/^[a-zA-Z0-9_\-/.]+$/, 'Storage path contains invalid characters')
    .refine((p) => !p.includes('..'), 'Path traversal not allowed'),
  categoryId: z.number().int().positive().nullable().optional(),
  description: z.string().nullable().optional(),
});

const bulkDocumentSchema = z.object({
  communityIds: z.array(z.number().int().positive()).min(1, 'At least one community is required'),
  documents: z.array(documentItemSchema).min(1, 'At least one document is required'),
});

// ---------------------------------------------------------------------------
// POST — Bulk create document records across communities
// ---------------------------------------------------------------------------

interface DocumentResult {
  communityId: number;
  communityName: string;
  status: 'created' | 'failed';
  documentsCreated?: number;
  error?: string;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();

  // Verify PM role
  const isPm = await isPmAdminInAnyCommunity(userId);
  if (!isPm) {
    throw new ForbiddenError('Only property managers can perform bulk document uploads');
  }

  const body: unknown = await req.json();
  const parseResult = bulkDocumentSchema.safeParse(body);
  if (!parseResult.success) {
    throw new ValidationError('Invalid bulk document payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const { communityIds, documents: docPayloads } = parseResult.data;

  // Validate each communityId belongs to this PM's managed set
  const managed = await findManagedCommunitiesPortfolioUnscoped(userId);
  const managedMap = new Map(managed.map((c) => [c.communityId, c.communityName]));

  const invalidIds = communityIds.filter((id) => !managedMap.has(id));
  if (invalidIds.length > 0) {
    throw new ForbiddenError(
      `You do not manage communities: ${invalidIds.join(', ')}`,
    );
  }

  // Create document records in each community using Promise.allSettled
  const results = await Promise.allSettled(
    communityIds.map(async (communityId): Promise<DocumentResult> => {
      await assertNotDemoGrace(communityId);
      const communityName = managedMap.get(communityId) ?? `Community ${communityId}`;
      const scoped = createScopedClient(communityId);
      let createdCount = 0;

      for (const doc of docPayloads) {
        await scoped.insert(documents, {
          title: doc.fileName,
          description: doc.description ?? null,
          categoryId: doc.categoryId ?? null,
          filePath: doc.storagePath,
          fileName: doc.fileName,
          fileSize: 0, // Size not tracked in bulk — already uploaded
          mimeType: 'application/octet-stream',
          uploadedBy: userId,
        });
        createdCount++;
      }

      return {
        communityId,
        communityName,
        status: 'created',
        documentsCreated: createdCount,
      };
    }),
  );

  // Map settled results
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
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    };
  });

  return NextResponse.json({ results: mapped });
});
