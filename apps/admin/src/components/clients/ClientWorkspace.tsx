'use client';

/**
 * P1-6: Client Workspace — tab layout with Overview and Settings.
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

interface CommunitySettings {
  announcementsWriteLevel?: 'all_members' | 'admin_only';
  meetingsWriteLevel?: 'all_members' | 'admin_only';
  meetingDocumentsWriteLevel?: 'all_members' | 'admin_only';
  unitsWriteLevel?: 'all_members' | 'admin_only';
  leasesWriteLevel?: 'all_members' | 'admin_only';
  documentCategoriesWriteLevel?: 'all_members' | 'admin_only';
}

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

type Tab = 'overview' | 'settings';

export function ClientWorkspace({ community }: ClientWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const statusEntry = SUBSCRIPTION_STATUS_LABELS[community.subscription_status ?? ''];
  const statusClass = statusEntry?.className ?? 'bg-gray-100 text-gray-600';

  const address = [community.address_line1, community.city, community.state, community.zip_code]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb + header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link
          href="/clients"
          className="mb-3 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={12} />
          Client Portfolio
        </Link>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{community.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-500">
                {COMMUNITY_TYPE_LABELS[community.community_type]?.label ?? community.community_type}
              </span>
              {address && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="text-sm text-gray-500">{address}</span>
                </>
              )}
            </div>
          </div>
          {community.subscription_status && (
            <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${statusClass}`}>
              {statusEntry?.label ?? community.subscription_status.replace('_', ' ')}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white px-6">
        <div className="flex gap-1">
          {(['overview', 'settings'] as Tab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={[
                'px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              {tab === 'overview' ? 'Overview' : 'Settings'}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats grid */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-e1">
                <div className="flex items-center gap-2 text-gray-500 mb-1">
                  <Users size={16} />
                  <span className="text-xs font-medium uppercase tracking-wide">Members</span>
                </div>
                <p className="text-2xl font-semibold text-gray-900">{community.memberCount}</p>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-e1">
                <div className="flex items-center gap-2 text-gray-500 mb-1">
                  <FileText size={16} />
                  <span className="text-xs font-medium uppercase tracking-wide">Documents</span>
                </div>
                <p className="text-2xl font-semibold text-gray-900">{community.documentCount}</p>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-e1">
                <div className="flex items-center gap-2 text-gray-500 mb-1">
                  <CheckCircle size={16} />
                  <span className="text-xs font-medium uppercase tracking-wide">Compliance</span>
                </div>
                {community.complianceScore !== null ? (
                  <div className="flex items-end gap-1.5">
                    <p className="text-2xl font-semibold text-gray-900">{community.complianceScore}%</p>
                    {community.complianceScore === 100 && (
                      <BadgeCheck size={20} className="mb-0.5 text-green-500" />
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">No data</p>
                )}
              </div>
            </div>

            {/* Details */}
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-e1">
              <h2 className="mb-4 text-sm font-semibold text-gray-700">Community Details</h2>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-gray-500">Name</dt>
                  <dd className="mt-0.5 text-sm text-gray-900">{community.name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Slug</dt>
                  <dd className="mt-0.5 font-mono text-sm text-gray-900">{community.slug}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Type</dt>
                  <dd className="mt-0.5 text-sm text-gray-900">
                    {COMMUNITY_TYPE_LABELS[community.community_type]?.label ?? community.community_type}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Plan</dt>
                  <dd className="mt-0.5 text-sm text-gray-900 capitalize">
                    {community.subscription_plan ?? '—'}
                  </dd>
                </div>
                {address && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-gray-500">Address</dt>
                    <dd className="mt-0.5 text-sm text-gray-900">{address}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs text-gray-500">Created</dt>
                  <dd className="mt-0.5 text-sm text-gray-900">
                    {format(new Date(community.created_at), 'MMM d, yyyy')}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
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
