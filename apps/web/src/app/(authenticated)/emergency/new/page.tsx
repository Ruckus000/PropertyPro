// breadcrumbs:exempt — delegated to apps/web/src/components/emergency/emergency-new-page.tsx
// page-template: delegated to apps/web/src/components/emergency/emergency-new-page.tsx
/**
 * New Emergency Broadcast composer page.
 *
 * Route: /emergency/new?communityId=X[&from=<alert id>]
 * Auth: admin with emergency_broadcasts write permission.
 *
 * `from` is "Send again later": the composer opens pre-filled from that alert.
 * It is read through the community-scoped client, so an id from another
 * community finds nothing; a malformed, foreign or missing id is ignored and
 * the empty composer renders.
 */
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { communities, createScopedClient } from '@propertypro/db';
import { resolvePageCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { requirePermission } from '@/lib/db/access-control';
import { isSmsDispatchGloballyEnabled } from '@/lib/sms/dispatch-flag';
import { getBroadcastWithReport } from '@/lib/services/emergency-broadcast-service';
import { EmergencyNewPage } from '@/components/emergency/emergency-new-page';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewBroadcastPage({ searchParams }: PageProps) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([
    searchParams,
    headers(),
  ]);

  const context = resolvePageCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    headers: requestHeaders,
  });

  if (!context.communityId) {
    redirect('/emergency');
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(context.communityId, userId);
  requirePermission(membership, 'emergency_broadcasts', 'write');

  // Load community name for template placeholders
  const scoped = createScopedClient(context.communityId);
  const communityRows = await scoped.query(communities);
  const community = communityRows.find((r) => r['id'] === context.communityId);
  const communityName = typeof community?.['name'] === 'string' ? community['name'] : 'PropertyPro';

  // BOTH layers, not just the per-community flag. The service checks the env
  // floor as well, so passing only `membership.smsDispatchEnabled` would offer
  // an SMS channel that silently gets skipped server-side — worse than not
  // offering it, because the admin would believe texts went out.
  // See @/lib/sms/dispatch-flag.
  const smsEnabled = isSmsDispatchGloballyEnabled() && membership.smsDispatchEnabled;

  const from = resolvedSearchParams['from'];
  const fromId = typeof from === 'string' && /^[1-9]\d{0,14}$/.test(from) ? Number(from) : null;
  // Write permission (checked above) is manager-only, and managers read every alert.
  const sourceAlert = fromId
    ? await getBroadcastWithReport(fromId, context.communityId).catch(() => null)
    : null;

  return (
    <EmergencyNewPage
      communityId={context.communityId}
      communityName={communityName}
      communityType={membership.communityType}
      smsEnabled={smsEnabled}
      timeZone={membership.timezone}
      source={
        sourceAlert
          ? {
              title: sourceAlert.title,
              body: sourceAlert.body,
              smsBody: sourceAlert.smsBody,
              severity: sourceAlert.severity,
              targetAudience: sourceAlert.targetAudience,
              channels: sourceAlert.channels,
            }
          : undefined
      }
    />
  );
}
