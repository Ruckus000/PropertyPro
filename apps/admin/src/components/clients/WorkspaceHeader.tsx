import Link from 'next/link';
import { ExternalLink, LifeBuoy } from 'lucide-react';
import { Badge, Button, type BadgeVariant } from '@propertypro/ui';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { COMMUNITY_TYPE_LABELS, SUBSCRIPTION_STATUS_LABELS } from '@/lib/constants/community-labels';
import { getSiteLiveStatus, getWebsiteDomainInfo } from '@/lib/clients/website';

const STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
  active: 'success',
  trialing: 'info',
  past_due: 'warning',
  canceled: 'neutral',
};

interface WorkspaceHeaderCommunity {
  id: number;
  name: string;
  slug: string;
  community_type: string;
  city: string | null;
  subscription_status: string | null;
  custom_domain: string | null;
  site_published_at: string | null;
}

interface WorkspaceHeaderProps {
  community: WorkspaceHeaderCommunity;
}

/**
 * Renders the workspace's only `<h1>` (via `AdminPageHeader`). `ClientWorkspace`
 * must not also render one — see task-17a-dispatch-notes.md correction #1.
 */
export function WorkspaceHeader({ community }: WorkspaceHeaderProps) {
  const typeLabel = COMMUNITY_TYPE_LABELS[community.community_type]?.label ?? community.community_type;
  const statusEntry = community.subscription_status
    ? SUBSCRIPTION_STATUS_LABELS[community.subscription_status]
    : undefined;
  const statusVariant = community.subscription_status
    ? (STATUS_BADGE_VARIANT[community.subscription_status] ?? 'neutral')
    : 'neutral';
  const siteLiveStatus = getSiteLiveStatus({
    sitePublishedAt: community.site_published_at,
    subscriptionStatus: community.subscription_status,
  });
  const domainInfo = getWebsiteDomainInfo({
    slug: community.slug,
    customDomain: community.custom_domain,
  });

  return (
    <AdminPageHeader
      title={community.name}
      backHref="/clients"
      backLabel="Clients"
      eyebrow={
        <>
          {statusEntry && (
            <Badge variant={statusVariant} size="sm">
              {statusEntry.label}
            </Badge>
          )}
          <Badge variant={siteLiveStatus.isLive ? 'success' : 'neutral'} size="sm" outlined>
            {siteLiveStatus.isLive ? 'Site live' : 'Site not live'}
          </Badge>
          <span className="text-sm text-content-tertiary">
            {typeLabel}
            {community.city ? ` · ${community.city}` : ''} · <code className="text-xs">{community.slug}</code>
          </span>
        </>
      }
      actions={
        <>
          <Button asChild variant="outline" size="sm">
            <a href={`https://${domainInfo.displayUrl}`} target="_blank" rel="noreferrer noopener">
              Open site
              <ExternalLink size={14} aria-hidden="true" className="ml-1.5" />
            </a>
          </Button>
          <Button asChild size="sm">
            <Link href={`/clients/${community.id}?tab=support&start=1`}>
              <LifeBuoy size={14} aria-hidden="true" className="mr-1.5" />
              Start support session
            </Link>
          </Button>
        </>
      }
    />
  );
}
