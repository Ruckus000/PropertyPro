'use client';

/**
 * Client Workspace — tab layout with Overview, Members, Compliance, and Settings.
 */
import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, Users, FileText, CheckCircle, BadgeCheck } from 'lucide-react';
import {
  COMMUNITY_TYPE_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
} from '@/lib/constants/community-labels';
import { CommunitySettingsEditor } from './CommunitySettingsEditor';
import { CommunityMembers } from './CommunityMembers';
import { CommunityCompliance } from './CommunityCompliance';
import { WebsiteTabPanel } from './WebsiteTabPanel';
import { CommunityAccess } from './CommunityAccess';
import { SupportAccessTab } from './SupportAccessTab';
import {
  formatSiteNotLiveMessage,
  getSiteLiveStatus,
  getWebsiteDomainInfo,
} from '@/lib/clients/website';
import type { CommunitySettings } from './community-settings';
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
  custom_domain: string | null;
  site_published_at: string | null;
  timezone: string;
  transparency_enabled: boolean;
  community_settings: CommunitySettings;
  created_at: string;
  memberCount: number;
  documentCount: number;
  complianceScore: number | null;
}

interface ClientWorkspaceProps {
  community: Community;
}

type Tab = 'overview' | 'members' | 'compliance' | 'access' | 'website' | 'support' | 'settings';

const TAB_LABELS: Record<Tab, string> = {
  overview: 'Overview',
  members: 'Members',
  compliance: 'Compliance',
  access: 'Access',
  website: 'Website',
  support: 'Support',
  settings: 'Settings',
};

export function ClientWorkspace({ community }: ClientWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const statusEntry = SUBSCRIPTION_STATUS_LABELS[community.subscription_status ?? ''];
  const statusClass = statusEntry?.className ?? 'bg-surface-muted text-content-secondary';
  const domainInfo = getWebsiteDomainInfo({
    slug: community.slug,
    customDomain: community.custom_domain,
  });
  const siteLiveStatus = getSiteLiveStatus({
    sitePublishedAt: community.site_published_at,
    subscriptionStatus: community.subscription_status,
  });
  const siteNotLiveMessage = formatSiteNotLiveMessage(siteLiveStatus);
  const publishedLabel = community.site_published_at
    ? format(new Date(community.site_published_at), 'MMM d, yyyy')
    : null;

  const address = [community.address_line1, community.city, community.state, community.zip_code]
    .filter(Boolean)
    .join(', ');

  // Apartments have no compliance items — hide the tab
  const tabs: Tab[] = community.community_type === 'apartment'
    ? ['overview', 'members', 'access', 'website', 'support', 'settings']
    : ['overview', 'members', 'compliance', 'access', 'website', 'support', 'settings'];

  const { tabListProps, getTabProps, getPanelProps } = useRovingTabs(
    tabs,
    activeTab,
    setActiveTab,
    { idPrefix: 'client-workspace', label: 'Community sections' },
  );

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb + header */}
      <div className="border-b border-edge bg-surface-card px-6 py-4">
        <Link
          href="/clients"
          className="mb-3 inline-flex items-center gap-1.5 text-xs text-content-tertiary hover:text-content-secondary"
        >
          <ArrowLeft size={12} />
          Client Portfolio
        </Link>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-content">{community.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-sm text-content-tertiary">
                {COMMUNITY_TYPE_LABELS[community.community_type]?.label ?? community.community_type}
              </span>
              {address && (
                <>
                  <span className="text-content-disabled">·</span>
                  <span className="text-sm text-content-tertiary">{address}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {community.subscription_status && (
              <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${statusClass}`}>
                {statusEntry?.label ?? community.subscription_status.replace('_', ' ')}
              </span>
            )}
            <span
              className={[
                'shrink-0 rounded-full px-3 py-1 text-sm font-medium',
                siteLiveStatus.isLive
                  ? 'bg-status-success-subtle text-status-success'
                  : 'bg-status-warning-subtle text-status-warning',
              ].join(' ')}
            >
              {siteLiveStatus.isLive ? 'Site Live' : 'Site Not Live'}
            </span>
            {publishedLabel && (
              <span className="text-xs text-content-tertiary">Published {publishedLabel}</span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-edge bg-surface-card px-6">
        <div className="flex gap-1" {...tabListProps}>
          {tabs.map((tab) => (
            <button
              key={tab}
              {...getTabProps(tab)}
              className={[
                'px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                activeTab === tab
                  ? 'border-coral-600 text-coral-700'
                  : 'border-transparent text-content-tertiary hover:text-content-secondary',
              ].join(' ')}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6" {...getPanelProps(activeTab)}>
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats grid */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-edge bg-surface-card p-5 shadow-e1">
                <div className="flex items-center gap-2 text-content-tertiary mb-1">
                  <Users size={16} />
                  <span className="text-xs font-medium uppercase tracking-wide">Members</span>
                </div>
                <p className="text-2xl font-semibold text-content">{community.memberCount}</p>
              </div>

              <div className="rounded-lg border border-edge bg-surface-card p-5 shadow-e1">
                <div className="flex items-center gap-2 text-content-tertiary mb-1">
                  <FileText size={16} />
                  <span className="text-xs font-medium uppercase tracking-wide">Documents</span>
                </div>
                <p className="text-2xl font-semibold text-content">{community.documentCount}</p>
              </div>

              <div className="rounded-lg border border-edge bg-surface-card p-5 shadow-e1">
                <div className="flex items-center gap-2 text-content-tertiary mb-1">
                  <CheckCircle size={16} />
                  <span className="text-xs font-medium uppercase tracking-wide">Compliance</span>
                </div>
                {community.complianceScore !== null ? (
                  <div className="flex items-end gap-1.5">
                    <p className="text-2xl font-semibold text-content">{community.complianceScore}%</p>
                    {community.complianceScore === 100 && (
                      <BadgeCheck size={20} className="mb-0.5 text-status-success" />
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-content-disabled">No data</p>
                )}
              </div>
            </div>

            {/* Details */}
            <div className="rounded-lg border border-edge bg-surface-card p-5 shadow-e1">
              <h2 className="mb-4 text-sm font-semibold text-content-secondary">Community Details</h2>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-content-tertiary">Name</dt>
                  <dd className="mt-0.5 text-sm text-content">{community.name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-content-tertiary">Slug</dt>
                  <dd className="mt-0.5 font-mono text-sm text-content">{community.slug}</dd>
                </div>
                <div>
                  <dt className="text-xs text-content-tertiary">Type</dt>
                  <dd className="mt-0.5 text-sm text-content">
                    {COMMUNITY_TYPE_LABELS[community.community_type]?.label ?? community.community_type}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-content-tertiary">Plan</dt>
                  <dd className="mt-0.5 text-sm text-content capitalize">
                    {community.subscription_plan ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-content-tertiary">Website URL</dt>
                  <dd className="mt-0.5 text-sm text-content font-mono">{domainInfo.displayUrl}</dd>
                  <p className="mt-0.5 text-xs text-content-tertiary">
                    {domainInfo.urlSource === 'custom_domain' ? 'Custom domain' : 'Default subdomain'}
                  </p>
                </div>
                {address && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-content-tertiary">Address</dt>
                    <dd className="mt-0.5 text-sm text-content">{address}</dd>
                  </div>
                )}
                <div className="sm:col-span-2">
                  <dt className="text-xs text-content-tertiary">Site Status</dt>
                  <dd className="mt-0.5 text-sm text-content">
                    {siteLiveStatus.isLive ? 'Live' : 'Not live'}
                  </dd>
                  {publishedLabel && (
                    <p className="mt-0.5 text-xs text-content-tertiary">Published {publishedLabel}</p>
                  )}
                  {!siteLiveStatus.isLive && siteNotLiveMessage && (
                    <p className="mt-0.5 text-xs text-content-tertiary">{siteNotLiveMessage}</p>
                  )}
                </div>
                <div>
                  <dt className="text-xs text-content-tertiary">Created</dt>
                  <dd className="mt-0.5 text-sm text-content">
                    {format(new Date(community.created_at), 'MMM d, yyyy')}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        )}

        {activeTab === 'members' && (
          <CommunityMembers communityId={community.id} />
        )}

        {activeTab === 'compliance' && (
          <CommunityCompliance communityId={community.id} />
        )}

        {activeTab === 'access' && (
          <CommunityAccess communityId={community.id} />
        )}

        {activeTab === 'website' && (
          <WebsiteTabPanel
            communityId={community.id}
            communitySlug={community.slug}
            customDomain={community.custom_domain}
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
          />
        )}
      </div>
    </div>
  );
}
