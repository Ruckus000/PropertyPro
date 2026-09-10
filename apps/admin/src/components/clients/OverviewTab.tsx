import { format } from 'date-fns';
import { CheckCircle, Clock, FileText, LifeBuoy, Users } from 'lucide-react';
import { AlertBanner, Card, CardContent, CardHeader, CardTitle, EmptyState, KpiCard } from '@propertypro/ui';
import { COMMUNITY_TYPE_LABELS } from '@/lib/constants/community-labels';
import { getSiteLiveStatus, getWebsiteDomainInfo, formatSiteNotLiveMessage } from '@/lib/clients/website';
import type { CommunityActivityEntry } from '@/lib/server/community-activity';

interface OverviewTabCommunity {
  name: string;
  slug: string;
  community_type: string;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  address_line1: string | null;
  subscription_status: string | null;
  subscription_plan: string | null;
  subscription_current_period_end_at: string | null;
  custom_domain: string | null;
  site_published_at: string | null;
  created_at: string;
  memberCount: number;
  documentCount: number;
  complianceScore: number | null;
}

interface OverviewTabProps {
  community: OverviewTabCommunity;
  activity: CommunityActivityEntry[];
}

/** `platform_admin_audit_log.action` values are snake_case; humanize for display. */
function humanizeAction(action: string): string {
  return action.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export function OverviewTab({ community, activity }: OverviewTabProps) {
  const typeLabel = COMMUNITY_TYPE_LABELS[community.community_type]?.label ?? community.community_type;
  const domainInfo = getWebsiteDomainInfo({
    slug: community.slug,
    customDomain: community.custom_domain,
  });
  const siteLiveStatus = getSiteLiveStatus({
    sitePublishedAt: community.site_published_at,
    subscriptionStatus: community.subscription_status,
  });
  const siteNotLiveMessage = formatSiteNotLiveMessage(siteLiveStatus);
  const address = [community.address_line1, community.city, community.state, community.zip_code]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="space-y-6">
      {community.subscription_status === 'past_due' && (
        <AlertBanner
          status="warning"
          title="Subscription is past due"
          description={
            community.subscription_current_period_end_at
              ? `The current billing period ended ${format(new Date(community.subscription_current_period_end_at), 'MMM d, yyyy')}.`
              : 'No current billing period end date is on file.'
          }
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Members" value={community.memberCount} icon={Users} />
        <KpiCard title="Documents" value={community.documentCount} icon={FileText} />
        <KpiCard
          title="Compliance"
          value={community.complianceScore !== null ? `${community.complianceScore}%` : '—'}
          icon={CheckCircle}
        />
        {/* Open tickets needs the ticketing system (Wave 3a) — render a dash rather than a fake 0. */}
        <KpiCard title="Open tickets" value="—" icon={LifeBuoy} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Community details</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-content-tertiary">Type</dt>
              <dd className="mt-0.5 text-sm text-content">{typeLabel}</dd>
            </div>
            <div>
              <dt className="text-xs text-content-tertiary">Plan</dt>
              <dd className="mt-0.5 text-sm capitalize text-content">
                {community.subscription_plan?.replace(/_/g, ' ') ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-content-tertiary">Website URL</dt>
              <dd className="mt-0.5 font-mono text-sm text-content">{domainInfo.displayUrl}</dd>
              <p className="mt-0.5 text-xs text-content-tertiary">
                {domainInfo.urlSource === 'custom_domain' ? 'Custom domain' : 'Default subdomain'}
              </p>
            </div>
            <div>
              <dt className="text-xs text-content-tertiary">Site status</dt>
              <dd className="mt-0.5 text-sm text-content">{siteLiveStatus.isLive ? 'Live' : 'Not live'}</dd>
              {!siteLiveStatus.isLive && siteNotLiveMessage && (
                <p className="mt-0.5 text-xs text-content-tertiary">{siteNotLiveMessage}</p>
              )}
            </div>
            {address && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-content-tertiary">Address</dt>
                <dd className="mt-0.5 text-sm text-content">{address}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-content-tertiary">Created</dt>
              <dd className="mt-0.5 text-sm text-content">{format(new Date(community.created_at), 'MMM d, yyyy')}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {activity.length === 0 ? (
            <EmptyState
              icon={Clock}
              size="sm"
              title="No recent activity"
              description="Actions platform admins take on this community will show up here."
            />
          ) : (
            <ul className="divide-y divide-edge-subtle">
              {activity.map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm text-content">{humanizeAction(entry.action)}</p>
                    <p className="mt-0.5 text-xs text-content-tertiary">{entry.adminEmail ?? 'System'}</p>
                  </div>
                  <time
                    dateTime={entry.createdAt}
                    className="shrink-0 text-xs text-content-tertiary"
                  >
                    {format(new Date(entry.createdAt), 'MMM d, h:mm a')}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
