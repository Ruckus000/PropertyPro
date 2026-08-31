/**
 * P4-64: Community data export API route.
 *
 * Exports community data (residents, documents, maintenance requests,
 * announcements) as a ZIP file containing individual CSV files.
 *
 * Auth chain: requireAuthenticatedUserId → requireFreshReauth → resolveEffectiveCommunityId →
 *   requireCommunityMembership → requireExportPermission (management tier or
 *   board designation — NOT `settings:read`, which admits every unit owner).
 *
 * RBAC: settings + read grants access to owner, board_member, board_president,
 * cam, site_manager, property_manager_admin. Denies tenant.
 */
import { NextResponse, type NextRequest } from 'next/server';
import archiver from 'archiver';
import { captureException } from '@sentry/nextjs';
import { nodeArchiveToWebStream } from '@/lib/services/archive-stream';
import { withErrorHandler } from '@/lib/api/error-handler';
import { BadRequestError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireFreshReauth } from '@/lib/api/reauth-guard';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireExportPermission } from '@/lib/services/export/export-route-auth';
import {
  exportResidents,
  exportDocuments,
  exportMaintenanceRequests,
  exportAnnouncements,
} from '@/lib/services/community-export';

// Node runtime is required for `archiver` (it is a Node stream library), and
// the default 10s ceiling is too tight for four full-table CSV builds on a large
// association.
export const runtime = 'nodejs';
export const maxDuration = 60;

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  await requireFreshReauth(actorUserId);

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
  // Was `requirePermission(membership, 'settings', 'read')`, which the RBAC
  // matrix grants to the `owner` row — so every unit owner could pull every
  // resident's name and email. Shares the async export's predicate now so the
  // two cannot drift. See docs/audits/2026-08-09-legal-risk-audit.md F-07.
  requireExportPermission(membership);

  // read-entitlement:exempt — a lapsed association must be able to retrieve its
  // own statutory records; gating export behind entitlement is the failure mode,
  // not the protection. Full rationale below.
  //
  // DELIBERATELY NOT gated by `requireEntitledForAdminRead`.
  //
  // Every other admin read is entitlement-gated, and this route used to be too.
  // That was backwards: the association that most needs to retrieve its records
  // — the one whose subscription just lapsed or that is mid-cancellation — was
  // exactly the one locked out of doing so. Florida associations carry statutory
  // record-retention duties (§718.111(12)(b)), and a paywall between a board and
  // its own official records is a liability we create, not one we mitigate.
  // Terms §5.3–5.4 and Privacy §5.3 now affirmatively promise export "at any
  // time, including after your subscription has lapsed" — this route is what
  // makes that promise true. Do not re-add the entitlement gate here.
  // See docs/audits/2026-08-09-legal-risk-audit.md F-07.

  // Run all four exports in parallel
  const [residents, documents, maintenance, announcements] = await Promise.all([
    exportResidents(communityId),
    exportDocuments(communityId),
    exportMaintenanceRequests(communityId),
    exportAnnouncements(communityId),
  ]);

  const exports = [residents, documents, maintenance, announcements];
  const anyTruncated = exports.some((e) => e.truncated);

  // Build ZIP archive and stream it to avoid buffering the entire file in memory.
  //
  // The bridge used to be hand-rolled inside `new ReadableStream({ start() })`,
  // enqueueing on every 'data' event with no `pull()` and calling finalize()
  // before any consumer had pulled — i.e. no backpressure at all, so a slow
  // client accumulated the whole zip in the controller queue. `Readable.toWeb`
  // pauses the Node stream when the web queue fills. See
  // @/lib/services/archive-stream and audit F-07.
  const archive = archiver('zip', { zlib: { level: 6 } });

  // withErrorHandler cannot catch anything thrown after headers are sent, so a
  // mid-stream archive failure would otherwise be entirely invisible.
  archive.on('error', (err: Error) => {
    captureException(err, { tags: { route: 'export', phase: 'archive' } });
  });
  archive.on('warning', (err: Error) => {
    captureException(err, { tags: { route: 'export', phase: 'archive-warning' } });
  });

  const stream = nodeArchiveToWebStream(archive);

  for (const csv of exports) {
    archive.append(csv.content, { name: csv.filename });
  }
  void archive.finalize();

  const responseHeaders: Record<string, string> = {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="community-export-${communityId}.zip"`,
  };
  if (anyTruncated) {
    responseHeaders['X-Export-Truncated'] = 'true';
  }

  return new NextResponse(stream, { status: 200, headers: responseHeaders });
});
