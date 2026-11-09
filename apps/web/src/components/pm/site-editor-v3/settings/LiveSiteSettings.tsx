'use client';

/**
 * The site settings that take effect when they are saved, on the website
 * overview's Settings tab (design D): the site icon and footer, the logos, the
 * address and your own domain, search and sharing, the urgent notice, and who
 * can see what.
 *
 * They moved here from the editor's Site settings, which keeps only Pages and
 * Design: the editor is where drafts wait for Publish, and none of these wait.
 * An urgent notice in particular must go up the moment it is posted.
 *
 * Loaded on the Settings tab's first visit (`website-home-lazy`): the overview
 * route is held to the web JS budget, and most visits never open it. The panels
 * read and write through React Query, seeded from the page's loader so they
 * open with real values rather than a spinner.
 */
import Link from 'next/link';
import { Copy } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { useSiteSettings, type SiteSettingsRecord } from '@/hooks/use-site-settings';
import type { UrgentNotice } from '@/hooks/use-urgent-notice';
import { DEFAULT_SITE_SETTINGS, resolveSeoDescription } from '@/lib/site-editor/site-settings';
import { DomainPanel } from '../panels/DomainPanel';
import { LogosSection } from '../panels/LogosSection';
import { ShareImageField, SiteIconField, SitePanel, StorageMeter } from '../panels/SitePanel';
import { UrgentNoticePanel } from '../panels/UrgentNoticePanel';
import { PageSeoCard } from './PageSeoCard';
import { SettingsCard } from './settings-card';

export interface LiveSiteSettingsProps {
  communityId: number;
  community: {
    name: string;
    slug: string;
    communityType: 'condo_718' | 'hoa_720' | 'apartment';
    city?: string | null;
  };
  tagline: string | null;
  initialSettings?: SiteSettingsRecord;
  /** The site's PropertyPro address, e.g. `https://sunset.getpropertypro.com/`. */
  publicSiteUrl: string | null;
  hasSiteCustomDomain: boolean;
  /** Whether the site has ever been published: a notice needs somewhere to show. */
  hasPublishedSite: boolean;
  initialNotice: UrgentNotice | null;
}

export function LiveSiteSettings({
  communityId,
  community,
  tagline,
  initialSettings,
  publicSiteUrl,
  hasSiteCustomDomain,
  hasPublishedSite,
  initialNotice,
}: LiveSiteSettingsProps) {
  const { data: record } = useSiteSettings(communityId, initialSettings);
  const { copy } = useCopyToClipboard();
  const address = publicSiteUrl?.replace(/^https?:\/\//, '').replace(/\/$/, '') ?? null;

  return (
    <div className="space-y-6" data-testid="live-site-settings">
      <SettingsCard title="Urgent notice">
        <UrgentNoticePanel
          communityId={communityId}
          hasPublishedSite={hasPublishedSite}
          initialNotice={initialNotice}
        />
      </SettingsCard>

      <SettingsCard title="Your PropertyPro address">
        <p className="text-sm text-content-secondary">
          This address always works, even after you connect your own domain.
        </p>
        {address ? (
          <div className="flex flex-wrap items-center gap-3">
            <span
              className="rounded-[var(--radius-md)] bg-surface-muted px-3 py-2 font-mono text-sm text-content"
              data-testid="settings-address"
            >
              {address}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copy(publicSiteUrl ?? address, 'Copied.')}
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              Copy
            </Button>
          </div>
        ) : (
          <p className="text-sm text-content-secondary">Your address isn&apos;t available right now.</p>
        )}
      </SettingsCard>

      <SettingsCard title="Use your own domain">
        <DomainPanel communityId={communityId} hasSiteCustomDomain={hasSiteCustomDomain} />
      </SettingsCard>

      <SettingsCard title="Site name and icon">
        <div className="space-y-1">
          <p className="text-sm font-medium text-content">Site name</p>
          <p className="text-sm text-content" data-testid="settings-site-name">
            {community.name}
          </p>
          <p className="text-sm text-content-tertiary">
            Your site uses your community&apos;s name in its header, the browser tab and search
            results.
          </p>
        </div>
        <SiteIconField communityId={communityId} initialSettings={initialSettings} />
        {record?.storage ? <StorageMeter storage={record.storage} /> : null}
      </SettingsCard>

      <SettingsCard>
        <LogosSection communityId={communityId} />
      </SettingsCard>

      <SettingsCard>
        <SitePanel
          part="footer"
          communityId={communityId}
          community={community}
          tagline={tagline}
          initialSettings={initialSettings}
        />
      </SettingsCard>

      <SettingsCard>
        <SitePanel
          part="search"
          communityId={communityId}
          community={community}
          tagline={tagline}
          initialSettings={initialSettings}
        />
      </SettingsCard>
      <SettingsCard>
        <ShareImageField communityId={communityId} initialSettings={initialSettings} />
      </SettingsCard>
      <SettingsCard>
        <PageSeoCard
          communityId={communityId}
          communityName={community.name}
          // What a page's description falls back to: the site's, as the public
          // page computes it (its own default when none is set).
          siteDescription={resolveSeoDescription(record?.settings ?? DEFAULT_SITE_SETTINGS, community, tagline)}
        />
      </SettingsCard>

      <SettingsCard title="Who can see what">
        <p className="text-sm text-content">
          <span className="font-semibold">The pages you publish are open to everyone.</span> Anyone
          with the address can read them.
        </p>
        <p className="text-sm text-content">
          <span className="font-semibold">Official records are for owners and residents who sign in.</span>{' '}
          Each document stays private until you open it to the public, one at a time, in Documents.
        </p>
        <Link
          href={`/communities/${communityId}/documents`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Open Documents
        </Link>
      </SettingsCard>
    </div>
  );
}
