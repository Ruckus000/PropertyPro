'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save, RotateCcw } from 'lucide-react';
import {
  COMMUNITY_FEATURES,
  PLAN_IDS,
  type CommunityType,
  type CommunityFeatures,
} from '@propertypro/shared';
import type {
  CommunitySettings,
  CommunityWriteSettings,
  LegalGateKey,
} from './community-settings';
import { LEGAL_GATES } from './community-settings';

interface CommunityData {
  id: number;
  name: string;
  communityType: CommunityType;
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

interface WriteLevelConfig {
  key: keyof CommunityWriteSettings;
  label: string;
  helpText: string;
  /** Feature flag key from CommunityFeatures — if set, toggle is only shown when the flag is true. */
  featureFlag?: keyof CommunityFeatures;
}

const WRITE_LEVEL_CONFIG: WriteLevelConfig[] = [
  {
    key: 'announcementsWriteLevel',
    label: 'Announcements',
    helpText: 'Controls who can create and edit community announcements.',
  },
  {
    key: 'meetingsWriteLevel',
    label: 'Meetings',
    helpText: 'Controls who can create, edit, and cancel meetings.',
    featureFlag: 'hasMeetings',
  },
  {
    key: 'meetingDocumentsWriteLevel',
    label: 'Meeting Documents',
    helpText: 'Controls who can attach or remove documents from meetings.',
    featureFlag: 'hasMeetings',
  },
  {
    key: 'unitsWriteLevel',
    label: 'Units',
    helpText: 'Controls who can create and modify unit records.',
  },
  {
    key: 'leasesWriteLevel',
    label: 'Leases',
    helpText: 'Controls who can create, renew, and terminate leases.',
    featureFlag: 'hasLeaseTracking',
  },
  {
    key: 'documentCategoriesWriteLevel',
    label: 'Document Categories',
    helpText: 'Controls who can create custom document categories.',
  },
];

const SUBSCRIPTION_OPTIONS = ['active', 'trialing', 'past_due', 'canceled'] as const;

const PLAN_LABELS: Record<(typeof PLAN_IDS)[number], string> = {
  essentials: 'Essentials',
  professional: 'Professional',
  operations_plus: 'Operations Plus',
};

const US_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
] as const;

function getVisibleWriteLevelToggles(communityType: CommunityType): WriteLevelConfig[] {
  const features = COMMUNITY_FEATURES[communityType];
  return WRITE_LEVEL_CONFIG.filter(
    (config) => !config.featureFlag || features[config.featureFlag],
  );
}

export function CommunitySettingsEditor({ community: initial }: CommunitySettingsEditorProps) {
  const router = useRouter();
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

  const visibleToggles = getVisibleWriteLevelToggles(initial.communityType);

  function handleChange(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSuccess(false);
  }

  function handleWriteLevel(
    key: keyof CommunityWriteSettings,
    value: 'all_members' | 'admin_only',
  ) {
    setForm((prev) => ({
      ...prev,
      community_settings: { ...prev.community_settings, [key]: value },
    }));
    setSuccess(false);
  }

  function handleLegalGateChange(key: LegalGateKey, value: boolean) {
    setForm((prev) => ({
      ...prev,
      community_settings: {
        ...prev.community_settings,
        [key]: value,
      },
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

      // Plan: empty string ("Not set") means clear to null on the server.
      body.subscription_plan = form.subscription_plan || null;
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
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Metadata */}
      <div className="rounded-lg border border-edge bg-surface-card p-5 shadow-e1">
        <h2 className="mb-4 text-sm font-semibold text-content-secondary">Community Metadata</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-content-tertiary mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-coral-500 focus:outline-none focus:ring-1 focus:ring-coral-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-content-tertiary mb-1">Timezone</label>
            <select
              value={form.timezone}
              onChange={(e) => handleChange('timezone', e.target.value)}
              className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-coral-500 focus:outline-none focus:ring-1 focus:ring-coral-500"
            >
              {US_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz.replace('America/', '').replace('Pacific/', '').replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-content-tertiary mb-1">Address</label>
            <input
              type="text"
              value={form.address_line1}
              onChange={(e) => handleChange('address_line1', e.target.value)}
              placeholder="Street address"
              className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-coral-500 focus:outline-none focus:ring-1 focus:ring-coral-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-content-tertiary mb-1">City</label>
            <input
              type="text"
              value={form.city}
              onChange={(e) => handleChange('city', e.target.value)}
              className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-coral-500 focus:outline-none focus:ring-1 focus:ring-coral-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-content-tertiary mb-1">State</label>
              <input
                type="text"
                value={form.state}
                onChange={(e) => handleChange('state', e.target.value)}
                maxLength={2}
                placeholder="FL"
                className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-coral-500 focus:outline-none focus:ring-1 focus:ring-coral-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-content-tertiary mb-1">ZIP</label>
              <input
                type="text"
                value={form.zip_code}
                onChange={(e) => handleChange('zip_code', e.target.value)}
                maxLength={10}
                className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-coral-500 focus:outline-none focus:ring-1 focus:ring-coral-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Subscription */}
      <div className="rounded-lg border border-edge bg-surface-card p-5 shadow-e1">
        <h2 className="mb-4 text-sm font-semibold text-content-secondary">Subscription</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-content-tertiary mb-1">Plan</label>
            <select
              value={form.subscription_plan}
              onChange={(e) => handleChange('subscription_plan', e.target.value)}
              className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-coral-500 focus:outline-none focus:ring-1 focus:ring-coral-500"
            >
              <option value="">Not set</option>
              {PLAN_IDS.map((planId) => (
                <option key={planId} value={planId}>{PLAN_LABELS[planId]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-content-tertiary mb-1">Status</label>
            <select
              value={form.subscription_status}
              onChange={(e) => handleChange('subscription_status', e.target.value)}
              className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-coral-500 focus:outline-none focus:ring-1 focus:ring-coral-500"
            >
              <option value="">Not set</option>
              {SUBSCRIPTION_OPTIONS.map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Legal gates — one audited toggle per legally-exposed capability. */}
      <div className="rounded-lg border border-edge bg-surface-card p-5 shadow-e1">
        <h2 className="mb-1 text-sm font-semibold text-content-secondary">Legal Readiness Gates</h2>
        <p className="mb-4 text-xs text-content-disabled">
          Each of these controls a feature with statutory or regulatory exposure. All
          default to <strong>off</strong>. Every change is recorded individually in the
          admin audit log.
        </p>
        <div className="space-y-4">
          {LEGAL_GATES.map((gate) => {
            const enabled = form.community_settings[gate.key] === true;
            return (
              <div
                key={gate.key}
                className="flex items-start justify-between gap-4 border-t border-edge pt-4 first:border-t-0 first:pt-0"
              >
                <div>
                  <h3 className="text-sm font-medium text-content-secondary">{gate.title}</h3>
                  <p className="mt-0.5 text-xs text-content-disabled">{gate.description}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={`${gate.title} — ${enabled ? 'enabled' : 'disabled'}`}
                  onClick={() => handleLegalGateChange(gate.key, !enabled)}
                  className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    enabled ? 'bg-interactive' : 'bg-interactive-disabled'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-surface-card shadow ring-0 transition-transform ${
                      enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Write-Level Restrictions */}
      <div className="rounded-lg border border-edge bg-surface-card p-5 shadow-e1">
        <h2 className="mb-1 text-sm font-semibold text-content-secondary">Write-Level Restrictions</h2>
        <p className="mb-4 text-xs text-content-disabled">
          Control whether all community members or only admin roles (board members, CAM, site manager, PM admin) can create and edit content in each area. Default is &ldquo;All Members&rdquo;.
        </p>
        <div className="space-y-3">
          {visibleToggles.map(({ key, label, helpText }) => {
            const value = form.community_settings[key] ?? 'all_members';
            return (
              <div key={key} className="flex items-center justify-between rounded-md border border-edge-subtle bg-surface-page px-4 py-3">
                <div className="min-w-0 mr-4">
                  <span className="text-sm text-content-secondary">{label}</span>
                  <p className="text-xs text-content-disabled mt-0.5">{helpText}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleWriteLevel(key, 'all_members')}
                    className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                      value === 'all_members'
                        ? 'bg-coral-600 text-white'
                        : 'bg-surface-card text-content-tertiary border border-edge hover:bg-surface-muted'
                    }`}
                  >
                    All Members
                  </button>
                  <button
                    type="button"
                    onClick={() => handleWriteLevel(key, 'admin_only')}
                    className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                      value === 'admin_only'
                        ? 'bg-status-warning text-content-inverse'
                        : 'bg-surface-card text-content-tertiary border border-edge hover:bg-surface-muted'
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
      <div className="rounded-lg border border-edge bg-surface-card p-5 shadow-e1">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-content-secondary">Public Transparency Page</h2>
            <p className="mt-0.5 text-xs text-content-disabled">
              When enabled, a public compliance page is visible to non-members.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleChange('transparency_enabled', !form.transparency_enabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              form.transparency_enabled ? 'bg-interactive' : 'bg-interactive-disabled'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-surface-card shadow ring-0 transition-transform ${
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
          className="inline-flex items-center gap-2 rounded-md bg-coral-600 px-4 py-2 text-sm font-medium text-white hover:bg-coral-700 disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save Changes
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-2 rounded-md border border-edge-strong px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-page"
        >
          <RotateCcw size={14} />
          Reset
        </button>
        {error && <p className="text-sm text-status-danger">{error}</p>}
        {success && <p className="text-sm text-status-success">Saved successfully</p>}
      </div>
    </form>
  );
}
