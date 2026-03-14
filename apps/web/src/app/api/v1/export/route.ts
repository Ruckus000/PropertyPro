/**
 * P4-64: Community data export API route.
 *
 * Exports community data (residents, documents, maintenance requests,
 * announcements) as a ZIP file containing individual CSV files.
 *
 * Auth chain: requireAuthenticatedUserId → resolveEffectiveCommunityId →
 *   requireCommunityMembership → requirePermission(settings, read).
 *
 * RBAC: settings + read grants access to owner, board_member, board_president,
 * cam, site_manager, property_manager_admin. Denies tenant.
 */
import { NextResponse, type NextRequest } from 'next/server';
import archiver from 'archiver';
import { withErrorHandler } from '@/lib/api/error-handler';
import { BadRequestError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import {
  exportResidents,
  exportDocuments,
  exportMaintenanceRequests,
  exportAnnouncements,
} from '@/lib/services/community-export';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const { searchParams } = new URL(req.url);

  const rawCommunityId = searchParams.get('communityId');
  if (!rawCommunityId) {
    throw new BadRequestError('communityId query parameter is required');
  }

  const parsedCommunityId = Number(rawCommunityId);
  if (!Number.isInteger(parsedCommunityId) || parsedCommunityId <= 0) {
    throw new BadRequestError('communityId must be a positive integer');
  }

  const communityId = resolveEffectiveCommunityId(req, parsedCommunityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requirePermission(membership, 'settings', 'read');

  // Run all four exports in parallel
  const [residents, documents, maintenance, announcements] = await Promise.all([
    exportResidents(communityId),
    exportDocuments(communityId),
    exportMaintenanceRequests(communityId),
    exportAnnouncements(communityId),
  ]);

  const exports = [residents, documents, maintenance, announcements];
  const anyTruncated = exports.some((e) => e.truncated);

  // Build ZIP archive and stream it to avoid buffering the entire file in memory
  const archive = archiver('zip', { zlib: { level: 6 } });

  const stream = new ReadableStream({
    start(controller) {
      archive.on('data', (chunk: Buffer) => {
        controller.enqueue(chunk);
      });
      archive.on('end', () => {
        controller.close();
      });
      archive.on('error', (err: Error) => {
        controller.error(err);
      });

      for (const csv of exports) {
        archive.append(csv.content, { name: csv.filename });
      }

      archive.finalize();
    },
  });

  const responseHeaders: Record<string, string> = {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="community-export-${communityId}.zip"`,
  };
  if (anyTruncated) {
    responseHeaders['X-Export-Truncated'] = 'true';
  }

  return new NextResponse(stream, { status: 200, headers: responseHeaders });
});
