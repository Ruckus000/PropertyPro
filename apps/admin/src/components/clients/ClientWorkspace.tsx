'use client';

/**
 * Client Workspace — tab frame for a single community.
 *
 * Renders `WorkspaceHeader` (the screen's only `<h1>`), the tab strip, and
 * whichever panel is active. Panels beyond Overview/Billing (Members,
 * Compliance, Access, Website, Support, Settings) are implemented in their
 * own files, unchanged by this slice (task-17a) — see
 * `.superpowers/sdd/2026-09-08-admin-console-redesign/task-17a-dispatch-notes.md`.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { WorkspaceHeader } from './WorkspaceHeader';
import { OverviewTab } from './OverviewTab';
import { BillingTab } from './BillingTab';
import { CommunitySettingsEditor } from './CommunitySettingsEditor';
import { CommunityMembers } from './CommunityMembers';
import { CommunityCompliance } from './CommunityCompliance';
import { WebsiteTabPanel } from './WebsiteTabPanel';
import { CommunityAccess } from './CommunityAccess';
import { SupportAccessTab } from './SupportAccessTab';
import type { CommunitySettings } from './community-settings';
import type { CommunityActivityEntry } from '@/lib/server/community-activity';
import type { CommunitySnapshotEntry } from '@/lib/server/community-snapshots';
import { useRovingTabs } from '@/components/a11y/use-roving-tabs';

interface Community {
  id: number;
  name: string;
  slug: string;
  community_type: 'condo_718' | 'hoa_720' | 'apartment';
  city: string | null;
  state: string | null;
  zip_code: string | null;
  address_line1: string | null;
  subscription_status: string | null;
  subscription_plan: string | null;
  subscription_current_period_end_at: string | null;
  custom_domain: string | null;
  custom_domain_status: string | null;
  custom_domain_verified_at: string | null;
  site_published_at: string | null;
  timezone: string;
  transparency_enabled: boolean;
  community_settings: CommunitySettings;
  created_at: string;
  memberCount: number;
  documentCount: number;
  complianceScore: number | null;
  /**
   * Threaded through for the Settings tab's Danger Zone (owned by a later
   * slice) — not rendered by this one. Kept here so page.tsx only needs to
   * fetch it once.
   */
  openDeletionRequest: { id: number; status: string; coolingEndsAt: string } | null;
  activity: CommunityActivityEntry[];
  /** Publish history for the Website tab's `SnapshotsCard` (task 17c). */
  snapshots: CommunitySnapshotEntry[];
}

interface ClientWorkspaceProps {
  community: Community;
}

const ALL_TABS = [
  'overview',
  'billing',
  'members',
  'compliance',
  'access',
  'website',
  'support',
  'settings',
] as const;

type Tab = (typeof ALL_TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  overview: 'Overview',
  billing: 'Billing',
  members: 'Members',
  compliance: 'Compliance',
  access: 'Access',
  website: 'Website',
  support: 'Support',
  settings: 'Settings',
};

function isKnownTab(value: string | null, allowed: readonly Tab[]): value is Tab {
  return value !== null && (allowed as readonly string[]).includes(value);
}

export function ClientWorkspace({ community }: ClientWorkspaceProps) {
  const searchParams = useSearchParams();

  // Apartments have no compliance items — hide the tab.
  const tabs: readonly Tab[] =
    community.community_type === 'apartment' ? ALL_TABS.filter((t) => t !== 'compliance') : ALL_TABS;

  // `?tab=` is untrusted user input (a bookmark, a shared link, the ⌘K
  // palette) — validate against the tab list computed above and fall back to
  // Overview on anything unrecognized, rather than trusting it directly.
  const requestedTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<Tab>(isKnownTab(requestedTab, tabs) ? requestedTab : 'overview');

  // A Next.js client-side navigation into the SAME `/clients/[id]` route (e.g.
  // the header's "Start support session" link, `?tab=support&start=1`) does
  // not remount this component, so the `useState` initializer above only ever
  // runs once and would otherwise miss it. Re-sync whenever the URL's `tab`
  // changes out from under us. `handleTabChange` below also writes `?tab=`
  // itself; the `requestedTab !== activeTab` guard makes that a no-op here
  // rather than a redundant second `setActiveTab` with the same value.
  useEffect(() => {
    if (isKnownTab(requestedTab, tabs) && requestedTab !== activeTab) {
      setActiveTab(requestedTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the URL changing, not every render
  }, [requestedTab]);

  function handleTabChange(tab: Tab) {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'overview') {
      params.delete('tab');
    } else {
      params.set('tab', tab);
    }
    // `start` only makes sense for the initial navigation into Support from
    // the header's "Start support session" action — drop it on any manual
    // tab switch so it doesn't linger and reopen after the user has already
    // dismissed it.
    params.delete('start');
    const query = params.toString();
    // Write the address bar directly instead of `router.replace()`. The tab
    // is client state, not a page navigation — but `[id]/page.tsx` is
    // `dynamic = 'force-dynamic'` (0 staleTime router cache), so a Next
    // navigation here would re-run `requireAdminPageSession()` plus the
    // five-query `Promise.all` in page.tsx on every tab click.
    // `window.history.replaceState` updates the URL for linkability without
    // touching the router — the documented App Router approach now that
    // `shallow` is gone. This only changes how the URL is WRITTEN; the READ
    // path (the `useState` initializer and the `useEffect` above) is
    // untouched, so a real navigation into this route with a different
    // `?tab=` (e.g. the header's "Start support session" link) still lands
    // on the right tab.
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      window.history.replaceState(null, '', query ? `${path}?${query}` : path);
    }
  }

  const { tabListProps, getTabProps, getPanelProps } = useRovingTabs(tabs, activeTab, handleTabChange, {
    idPrefix: 'client-workspace',
    label: 'Community sections',
  });

  return (
    <div className="space-y-6">
      <WorkspaceHeader community={community} />

      <div className="border-b border-edge">
        <div className="flex gap-1 overflow-x-auto" {...tabListProps}>
          {tabs.map((tab) => (
            <button
              key={tab}
              {...getTabProps(tab)}
              className={[
                'min-h-11 shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors md:min-h-9',
                activeTab === tab
                  ? 'border-interactive text-content-brand'
                  : 'border-transparent text-content-tertiary hover:text-content-secondary',
              ].join(' ')}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      </div>

      <div {...getPanelProps(activeTab)}>
        {activeTab === 'overview' && <OverviewTab community={community} activity={community.activity} />}

        {activeTab === 'billing' && <BillingTab communityId={community.id} />}

        {activeTab === 'members' && <CommunityMembers communityId={community.id} />}

        {activeTab === 'compliance' && <CommunityCompliance communityId={community.id} />}

        {activeTab === 'access' && <CommunityAccess communityId={community.id} />}

        {activeTab === 'website' && (
          <WebsiteTabPanel
            communityId={community.id}
            communitySlug={community.slug}
            customDomain={community.custom_domain}
            customDomainStatus={community.custom_domain_status}
            customDomainVerifiedAt={community.custom_domain_verified_at}
            sitePublishedAt={community.site_published_at}
            subscriptionStatus={community.subscription_status}
            snapshots={community.snapshots}
          />
        )}

        {activeTab === 'support' && (
          <SupportAccessTab communityId={community.id} communitySlug={community.slug} />
        )}

        {activeTab === 'settings' && (
          <CommunitySettingsEditor
            community={{
              id: community.id,
              name: community.name,
              communityType: community.community_type,
              address_line1: community.address_line1,
              city: community.city,
              state: community.state,
              zip_code: community.zip_code,
              timezone: community.timezone,
              subscription_plan: community.subscription_plan,
              subscription_status: community.subscription_status,
              transparency_enabled: community.transparency_enabled,
              community_settings: community.community_settings,
            }}
            // `community.openDeletionRequest` was threaded onto this component's
            // props by task 17a specifically for this — see the field's
            // docblock above — so the Settings tab's Danger Zone (task 17b) can
            // render it without a second fetch.
            openDeletionRequest={community.openDeletionRequest}
          />
        )}
      </div>
    </div>
  );
}
