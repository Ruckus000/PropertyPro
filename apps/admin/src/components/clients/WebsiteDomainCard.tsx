/**
 * Website Domain Card — client workspace Website tab (task 17c).
 *
 * Shows what the platform already knows about a community's public-site
 * domain. Deliberately does NOT run a live DNS/TLS check — see
 * `.superpowers/sdd/2026-09-08-admin-console-redesign/task-17c-dispatch-notes.md`
 * §1:
 *
 *  - `apps/web/src/lib/services/custom-domain-service.ts` already gets
 *    authoritative per-record domain state from the Vercel domains API. A
 *    second, `node:dns`-probed answer in apps/admin would be a second source
 *    of truth for "is this domain healthy" — the same defect class this wave
 *    already hit twice elsewhere (a KPI disagreeing with its own chart; a
 *    report scoped differently from its source grid).
 *  - That web-app service is not reachable from apps/admin without a
 *    cross-app refactor, which is out of scope for a restyle slice.
 *  - Production, checked read-only: 5 live communities, 0 with a custom
 *    domain, 0 ever verified — so the "no custom domain" branch below is
 *    what every real community renders today.
 *
 * `customDomainStatus` / `customDomainVerifiedAt` are `communities.custom_domain_status`
 * / `custom_domain_verified_at` — the columns the web-app service itself
 * writes — rendered as-is rather than re-derived.
 */
import { format } from 'date-fns';
import { Globe } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle, type BadgeVariant } from '@propertypro/ui';
import { getSiteLiveStatus, getWebsiteDomainInfo, formatSiteNotLiveMessage } from '@/lib/clients/website';

interface WebsiteDomainCardProps {
  communitySlug: string;
  customDomain: string | null;
  customDomainStatus: string | null;
  customDomainVerifiedAt: string | null;
  sitePublishedAt: string | null;
  subscriptionStatus: string | null;
}

const DOMAIN_STATUS_VARIANT: Record<string, BadgeVariant> = {
  active: 'success',
  pending: 'warning',
  error: 'danger',
};

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function WebsiteDomainCard({
  communitySlug,
  customDomain,
  customDomainStatus,
  customDomainVerifiedAt,
  sitePublishedAt,
  subscriptionStatus,
}: WebsiteDomainCardProps) {
  const domainInfo = getWebsiteDomainInfo({ slug: communitySlug, customDomain });
  const liveStatus = getSiteLiveStatus({ sitePublishedAt, subscriptionStatus });
  const notLiveMessage = formatSiteNotLiveMessage(liveStatus);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Domain</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-content">{domainInfo.displayUrl}</span>
            <Badge variant={liveStatus.isLive ? 'success' : 'neutral'} size="sm" outlined>
              {liveStatus.isLive ? 'Live' : 'Not live'}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-content-tertiary">
            {domainInfo.urlSource === 'custom_domain' ? 'Custom domain' : 'Default subdomain'}
          </p>
          {domainInfo.ignoredInvalidCustomDomain && (
            <p className="mt-1 text-xs text-status-warning">
              Saved custom domain is invalid and is ignored for display.
            </p>
          )}
          {!liveStatus.isLive && notLiveMessage && (
            <p className="mt-1 text-xs text-content-tertiary">{notLiveMessage}</p>
          )}
        </div>

        {customDomain ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-edge-subtle pt-4">
            <Badge variant={DOMAIN_STATUS_VARIANT[customDomainStatus ?? ''] ?? 'neutral'} size="sm">
              {customDomainStatus ? capitalize(customDomainStatus) : 'Status unknown'}
            </Badge>
            {customDomainVerifiedAt && (
              <span className="text-xs text-content-tertiary">
                Verified {format(new Date(customDomainVerifiedAt), 'MMM d, yyyy')}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-md border border-dashed border-edge p-4">
            <Globe size={16} className="mt-0.5 shrink-0 text-content-disabled" aria-hidden="true" />
            <div>
              <p className="text-sm text-content-secondary">No custom domain configured</p>
              <p className="mt-0.5 text-xs text-content-tertiary">
                This community&rsquo;s site is served from its default subdomain.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
