'use client';

/**
 * Website Tab Panel — community website surface in apps/admin (task 17c).
 *
 * Composes three cards: `WebsiteDomainCard` (what the platform already knows
 * about the domain — read-only, no live DNS check, see that component's
 * docblock), the branding editor (`CommunityWebsiteEditor`), and
 * `SnapshotsCard` (read-only publish history).
 */
import { CommunityWebsiteEditor } from './CommunityWebsiteEditor';
import { WebsiteDomainCard } from './WebsiteDomainCard';
import { SnapshotsCard } from './SnapshotsCard';
import type { CommunitySnapshotEntry } from '@/lib/server/community-snapshots';

interface WebsiteTabPanelProps {
  communityId: number;
  communitySlug: string;
  customDomain: string | null;
  customDomainStatus: string | null;
  customDomainVerifiedAt: string | null;
  sitePublishedAt: string | null;
  subscriptionStatus: string | null;
  snapshots: CommunitySnapshotEntry[];
}

export function WebsiteTabPanel({
  communityId,
  communitySlug,
  customDomain,
  customDomainStatus,
  customDomainVerifiedAt,
  sitePublishedAt,
  subscriptionStatus,
  snapshots,
}: WebsiteTabPanelProps) {
  return (
    <div className="space-y-6">
      <WebsiteDomainCard
        communitySlug={communitySlug}
        customDomain={customDomain}
        customDomainStatus={customDomainStatus}
        customDomainVerifiedAt={customDomainVerifiedAt}
        sitePublishedAt={sitePublishedAt}
        subscriptionStatus={subscriptionStatus}
      />

      <CommunityWebsiteEditor communityId={communityId} communitySlug={communitySlug} />

      <SnapshotsCard snapshots={snapshots} />
    </div>
  );
}
