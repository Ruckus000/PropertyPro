'use client';

import { useState } from 'react';
import { Loader2, Save, RotateCcw } from 'lucide-react';

interface CommunitySettings {
  announcementsWriteLevel?: 'all_members' | 'admin_only';
  meetingsWriteLevel?: 'all_members' | 'admin_only';
  meetingDocumentsWriteLevel?: 'all_members' | 'admin_only';
  unitsWriteLevel?: 'all_members' | 'admin_only';
  leasesWriteLevel?: 'all_members' | 'admin_only';
  documentCategoriesWriteLevel?: 'all_members' | 'admin_only';
}

interface CommunityData {
  id: number;
  name: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  timezone: string;
  subscription_plan: string | null;
  subscription_status: string | null;
  transparency_enabled: boolean;
  community_settings: CommunitySettings;
}

interface CommunitySettingsEditorProps {
  community: CommunityData;
}

const WRITE_LEVEL_LABELS: Record<string, string> = {
  announcementsWriteLevel: 'Announcements',
  meetingsWriteLevel: 'Meetings',
  meetingDocumentsWriteLevel: 'Meeting Documents',
  unitsWriteLevel: 'Units',
  leasesWriteLevel: 'Leases',
  documentCategoriesWriteLevel: 'Document Categories',
};

const SUBSCRIPTION_OPTIONS = ['active', 'trialing', 'past_due', 'canceled'] as const;

const US_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
] as const;

export function CommunitySettingsEditor({ community: initial }: CommunitySettingsEditorProps) {
  const [form, setForm] = useState({
    name: initial.name,
    address_line1: initial.address_line1 ?? '',
    city: initial.city ?? '',
    state: initial.state ?? '',
    zip_code: initial.zip_code ?? '',
    timezone: initial.timezone,
    subscription_plan: initial.subscription_plan ?? '',
    subscription_status: initial.subscription_status ?? '',
    transparency_enabled: initial.transparency_enabled,
    community_settings: { ...initial.community_settings },
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  function handleChange(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSuccess(false);
  }

  function handleWriteLevel(key: keyof CommunitySettings, value: 'all_members' | 'admin_only') {
    setForm((prev) => ({
      ...prev,
      community_settings: { ...prev.community_settings, [key]: value },
    }));
    setSuccess(false);
  }

  function handleReset() {
    setForm({
      name: initial.name,
      address_line1: initial.address_line1 ?? '',
      city: initial.city ?? '',
      state: initial.state ?? '',
      zip_code: initial.zip_code ?? '',
      timezone: initial.timezone,
      subscription_plan: initial.subscription_plan ?? '',
      subscription_status: initial.subscription_status ?? '',
      transparency_enabled: initial.transparency_enabled,
      community_settings: { ...initial.community_settings },
    });
    setError('');
    setSuccess(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(false);

    try {
      const body: Record<string, unknown> = {
        name: form.name,
        address_line1: form.address_line1 || null,
        city: form.city || null,
        state: form.state || null,
        zip_code: form.zip_code || null,
        timezone: form.timezone,
        transparency_enabled: form.transparency_enabled,
        community_settings: form.community_settings,
      };

      if (form.subscription_plan) body.subscription_plan = form.subscription_plan;
      if (form.subscription_status) {
        body.subscription_status = form.subscription_status;
      }

      const res = await fetch(`/api/admin/communities/${initial.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? 'Failed to save');
        return;
      }

      setSuccess(true);
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Metadata */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-e1">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Community Metadata</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Timezone</label>
            <select
              value={form.timezone}
              onChange={(e) => handleChange('timezone', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {US_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz.replace('America/', '').replace('Pacific/', '').replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
            <input
              type="text"
              value={form.address_line1}
              onChange={(e) => handleChange('address_line1', e.target.value)}
              placeholder="Street address"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
            <input
              type="text"
              value={form.city}
              onChange={(e) => handleChange('city', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">State</label>
              <input
                type="text"
                value={form.state}
                onChange={(e) => handleChange('state', e.target.value)}
                maxLength={2}
                placeholder="FL"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">ZIP</label>
              <input
                type="text"
                value={form.zip_code}
                onChange={(e) => handleChange('zip_code', e.target.value)}
                maxLength={10}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Subscription */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-e1">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Subscription</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Plan</label>
            <input
              type="text"
              value={form.subscription_plan}
              onChange={(e) => handleChange('subscription_plan', e.target.value)}
              placeholder="e.g. starter, professional"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select
              value={form.subscription_status}
              onChange={(e) => handleChange('subscription_status', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Not set</option>
              {SUBSCRIPTION_OPTIONS.map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Write-Level Restrictions */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-e1">
        <h2 className="mb-1 text-sm font-semibold text-gray-700">Write-Level Restrictions</h2>
        <p className="mb-4 text-xs text-gray-400">
          Control whether all members or only admins can create/edit content in each area.
        </p>
        <div className="space-y-3">
          {Object.entries(WRITE_LEVEL_LABELS).map(([key, label]) => {
            const settingKey = key as keyof CommunitySettings;
            const value = form.community_settings[settingKey] ?? 'all_members';
            return (
              <div key={key} className="flex items-center justify-between rounded-md border border-gray-100 bg-gray-50 px-4 py-3">
                <span className="text-sm text-gray-700">{label}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => handleWriteLevel(settingKey, 'all_members')}
                    className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                      value === 'all_members'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    All Members
                  </button>
                  <button
                    type="button"
                    onClick={() => handleWriteLevel(settingKey, 'admin_only')}
                    className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                      value === 'admin_only'
                        ? 'bg-amber-600 text-white'
                        : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    Admin Only
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Transparency */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-e1">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Public Transparency Page</h2>
            <p className="mt-0.5 text-xs text-gray-400">
              When enabled, a public compliance page is visible to non-members.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleChange('transparency_enabled', !form.transparency_enabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              form.transparency_enabled ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                form.transparency_enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save Changes
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RotateCcw size={14} />
          Reset
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">Saved successfully</p>}
      </div>
    </form>
  );
}
