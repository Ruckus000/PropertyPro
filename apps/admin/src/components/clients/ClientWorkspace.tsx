'use client';

/**
 * P1-6: Client Workspace — tab layout with Overview, Site Builder, Settings.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, Users, FileText, CheckCircle, BadgeCheck, Globe, AlertTriangle } from 'lucide-react';
import {
  COMMUNITY_TYPE_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
} from '@/lib/constants/community-labels';

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
  created_at: string;
  memberCount: number;
  documentCount: number;
  complianceScore: number | null;
}

interface ClientWorkspaceProps {
  community: Community;
}

type Tab = 'overview' | 'site-builder' | 'settings';

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
          {(['overview', 'site-builder', 'settings'] as Tab[]).map((tab) => (
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
              {tab === 'overview' ? 'Overview' : tab === 'site-builder' ? 'Site Builder' : 'Settings'}
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

        {activeTab === 'site-builder' && (
          <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white">
            <div className="text-center">
              <Globe size={32} className="mx-auto mb-3 text-blue-500" />
              <p className="text-sm font-medium text-gray-700">Community Site Builder</p>
              <p className="mt-1 text-xs text-gray-400 mb-4">
                Drag-and-drop editor for the community public website
              </p>
              <Link
                href={`/clients/${community.id}/site-builder`}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                <Globe size={14} />
                Open Site Builder
              </Link>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <SettingsTab community={community} />
        )}
      </div>
    </div>
  );
}

/* ─── Settings Tab ──────────────────────────────────────────────────── */

const PLAN_OPTIONS = [
  { value: 'starter', label: 'Starter', price: '$99/mo' },
  { value: 'professional', label: 'Professional', price: '$199/mo' },
  { value: 'enterprise', label: 'Enterprise', price: '$399/mo' },
];

function SettingsTab({ community }: { community: Community }) {
  const router = useRouter();
  const [editName, setEditName] = useState(community.name);
  const [editAddress, setEditAddress] = useState(community.address_line1 ?? '');
  const [editCity, setEditCity] = useState(community.city ?? '');
  const [editState, setEditState] = useState(community.state ?? 'FL');
  const [editZip, setEditZip] = useState(community.zip_code ?? '');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch(`/api/admin/clients/${community.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          address_line1: editAddress || null,
          city: editCity || null,
          state: editState || null,
          zip_code: editZip || null,
        }),
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/clients/${community.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        router.push('/clients');
      }
    } finally {
      setDeleting(false);
    }
  };

  const statusEntry = SUBSCRIPTION_STATUS_LABELS[community.subscription_status ?? ''];
  const planEntry = PLAN_OPTIONS.find((p) => p.value === community.subscription_plan);

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Subscription */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Subscription</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-gray-500">Plan</dt>
            <dd className="mt-0.5 text-sm text-gray-900 capitalize">
              {planEntry ? `${planEntry.label} (${planEntry.price})` : community.subscription_plan ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Status</dt>
            <dd className="mt-0.5">
              {community.subscription_status ? (
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusEntry?.className ?? 'bg-gray-100 text-gray-600'}`}>
                  {statusEntry?.label ?? community.subscription_status}
                </span>
              ) : (
                <span className="text-sm text-gray-400">—</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Created</dt>
            <dd className="mt-0.5 text-sm text-gray-900">
              {format(new Date(community.created_at), 'MMMM d, yyyy')}
            </dd>
          </div>
        </dl>
      </div>

      {/* Community Details */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Community Details</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Slug</label>
            <p className="text-sm text-gray-400 font-mono">
              {community.slug}.propertyprofl.com
              <span className="ml-2 text-xs text-gray-300">(read-only)</span>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
              <input
                type="text"
                value={editAddress}
                onChange={(e) => setEditAddress(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
              <input
                type="text"
                value={editCity}
                onChange={(e) => setEditCity(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">State</label>
              <input
                type="text"
                value={editState}
                onChange={(e) => setEditState(e.target.value)}
                maxLength={2}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">ZIP Code</label>
              <input
                type="text"
                value={editZip}
                onChange={(e) => setEditZip(e.target.value)}
                maxLength={10}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            {saveSuccess && (
              <span className="text-xs text-green-600">Saved successfully</span>
            )}
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-lg border border-red-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-red-700">
          <AlertTriangle size={16} />
          Danger Zone
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Delete Community</p>
              <p className="text-xs text-gray-500">
                Permanently remove this community and all associated data
              </p>
            </div>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              Delete Community
            </button>
          </div>
        </div>

        {/* Delete confirmation modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-gray-900">Delete Community?</h3>
              <p className="mt-2 text-sm text-gray-500">
                This will permanently delete <span className="font-medium">{community.name}</span> and all associated data including documents, meetings, and user accounts. This action cannot be undone.
              </p>
              <div className="mt-4 flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Delete Permanently'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
