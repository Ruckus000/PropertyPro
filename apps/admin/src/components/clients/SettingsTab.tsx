'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { AlertTriangle } from 'lucide-react';
import { SUBSCRIPTION_STATUS_LABELS } from '@/lib/constants/community-labels';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { extractApiError } from '@/lib/http/extract-api-error';
import type { ClientWorkspaceCommunity } from './types';

const PLAN_OPTIONS = [
  { value: 'starter', label: 'Starter', price: '$99/mo' },
  { value: 'professional', label: 'Professional', price: '$199/mo' },
  { value: 'enterprise', label: 'Enterprise', price: '$399/mo' },
];

interface SettingsTabProps {
  community: ClientWorkspaceCommunity;
}

export function SettingsTab({ community }: SettingsTabProps) {
  const router = useRouter();
  const [editName, setEditName] = useState(community.name);
  const [editAddress, setEditAddress] = useState(community.address_line1 ?? '');
  const [editCity, setEditCity] = useState(community.city ?? '');
  const [editState, setEditState] = useState(community.state ?? 'FL');
  const [editZip, setEditZip] = useState(community.zip_code ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
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

      if (!res.ok) {
        throw new Error(await extractApiError(res));
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      router.refresh();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/admin/clients/${community.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error(await extractApiError(res));
      }

      setShowDeleteConfirm(false);
      router.push('/clients');
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to archive community');
    } finally {
      setDeleting(false);
    }
  };

  const statusEntry = SUBSCRIPTION_STATUS_LABELS[community.subscription_status ?? ''];
  const planEntry = PLAN_OPTIONS.find((plan) => plan.value === community.subscription_plan);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Subscription</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-gray-500">Plan</dt>
            <dd className="mt-0.5 text-sm text-gray-900 capitalize">
              {planEntry
                ? `${planEntry.label} (${planEntry.price})`
                : community.subscription_plan ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Status</dt>
            <dd className="mt-0.5">
              {community.subscription_status ? (
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    statusEntry?.className ?? 'bg-gray-100 text-gray-600'
                  }`}
                >
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

      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Community Details</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Name</label>
            <input
              type="text"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Slug</label>
            <p className="font-mono text-sm text-gray-400">
              {community.slug}.propertyprofl.com
              <span className="ml-2 text-xs text-gray-300">(read-only)</span>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Address</label>
              <input
                type="text"
                value={editAddress}
                onChange={(event) => setEditAddress(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">City</label>
              <input
                type="text"
                value={editCity}
                onChange={(event) => setEditCity(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">State</label>
              <input
                type="text"
                value={editState}
                onChange={(event) => setEditState(event.target.value)}
                maxLength={2}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">ZIP Code</label>
              <input
                type="text"
                value={editZip}
                onChange={(event) => setEditZip(event.target.value)}
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
            {saveSuccess && <span className="text-xs text-green-600">Saved successfully</span>}
          </div>
          {saveError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {saveError}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-red-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-red-700">
          <AlertTriangle size={16} />
          Danger Zone
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Archive Community</p>
              <p className="text-xs text-gray-500">
                Soft-delete this community and hide it from active platform views
              </p>
            </div>
            <button
              onClick={() => {
                setDeleteError(null);
                setShowDeleteConfirm(true);
              }}
              className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              Archive Community
            </button>
          </div>
        </div>

        {showDeleteConfirm && (
          <ConfirmDialog
            title="Archive Community?"
            message={
              <>
                <p>
                  This will soft-delete <span className="font-medium">{community.name}</span> by
                  setting a deleted flag.
                </p>
                <p className="mt-2">
                  Documents, meetings, and user accounts remain stored in the database but will no
                  longer appear in active platform views. This action does not permanently erase
                  records.
                </p>
              </>
            }
            errorMessage={deleteError}
            confirmLabel={deleting ? 'Archiving...' : 'Archive Community'}
            confirmVariant="danger"
            isPending={deleting}
            onConfirm={handleDelete}
            onCancel={() => {
              setDeleteError(null);
              setShowDeleteConfirm(false);
            }}
          />
        )}
      </div>
    </div>
  );
}
