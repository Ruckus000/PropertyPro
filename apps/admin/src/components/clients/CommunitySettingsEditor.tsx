'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, RotateCcw, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import {
  COMMUNITY_FEATURES,
  PLAN_IDS,
  planLabel,
  type CommunityType,
  type CommunityFeatures,
} from '@propertypro/shared';
import {
  AlertBanner,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Switch,
} from '@propertypro/ui';
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

interface DeletionRequestSummary {
  id: number;
  status: string;
  coolingEndsAt: string;
}

interface CommunitySettingsEditorProps {
  community: CommunityData;
  /** The community's open ('cooling') deletion request, if any — Danger Zone
   * links to it rather than offering a request button here (spec §1
   * non-goal: this screen does not initiate deletion). */
  openDeletionRequest?: DeletionRequestSummary | null;
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

const US_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
] as const;

const selectClassName =
  'flex h-9 w-full rounded-md border border-edge bg-transparent px-3 py-1 text-sm shadow-sm transition-colors duration-quick focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50';

function getVisibleWriteLevelToggles(communityType: CommunityType): WriteLevelConfig[] {
  const features = COMMUNITY_FEATURES[communityType];
  return WRITE_LEVEL_CONFIG.filter(
    (config) => !config.featureFlag || features[config.featureFlag],
  );
}

export function CommunitySettingsEditor({ community: initial, openDeletionRequest }: CommunitySettingsEditorProps) {
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
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column: Community fields + Who can write */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Community Metadata</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 pt-0 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="settings-name">Name</Label>
                <Input
                  id="settings-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="settings-timezone">Timezone</Label>
                <select
                  id="settings-timezone"
                  value={form.timezone}
                  onChange={(e) => handleChange('timezone', e.target.value)}
                  className={selectClassName}
                >
                  {US_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz.replace('America/', '').replace('Pacific/', '').replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="settings-address">Address</Label>
                <Input
                  id="settings-address"
                  type="text"
                  value={form.address_line1}
                  onChange={(e) => handleChange('address_line1', e.target.value)}
                  placeholder="Street address"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="settings-city">City</Label>
                <Input
                  id="settings-city"
                  type="text"
                  value={form.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="settings-state">State</Label>
                  <Input
                    id="settings-state"
                    type="text"
                    value={form.state}
                    onChange={(e) => handleChange('state', e.target.value)}
                    maxLength={2}
                    placeholder="FL"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="settings-zip">ZIP</Label>
                  <Input
                    id="settings-zip"
                    type="text"
                    value={form.zip_code}
                    onChange={(e) => handleChange('zip_code', e.target.value)}
                    maxLength={10}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subscription</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 pt-0 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="settings-plan">Plan</Label>
                <select
                  id="settings-plan"
                  value={form.subscription_plan}
                  onChange={(e) => handleChange('subscription_plan', e.target.value)}
                  className={selectClassName}
                >
                  <option value="">Not set</option>
                  {PLAN_IDS.map((planId) => (
                    <option key={planId} value={planId}>{planLabel(planId)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="settings-status">Status</Label>
                <select
                  id="settings-status"
                  value={form.subscription_status}
                  onChange={(e) => handleChange('subscription_status', e.target.value)}
                  className={selectClassName}
                >
                  <option value="">Not set</option>
                  {SUBSCRIPTION_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Who Can Write</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="mb-4 text-xs text-content-disabled">
                Control whether all community members or only admin roles (property manager,
                root manager, board designees) can create and edit content in each area. Default
                is &ldquo;All Members&rdquo;.
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
                      <div className="flex gap-1 shrink-0" role="group" aria-label={`${label} write access`}>
                        <Button
                          type="button"
                          size="sm"
                          variant={value === 'all_members' ? 'default' : 'outline'}
                          aria-pressed={value === 'all_members'}
                          onClick={() => handleWriteLevel(key, 'all_members')}
                        >
                          All Members
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={value === 'admin_only' ? 'default' : 'outline'}
                          aria-pressed={value === 'admin_only'}
                          onClick={() => handleWriteLevel(key, 'admin_only')}
                        >
                          Admin Only
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column: Legal gates + Danger zone */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Legal Readiness Gates</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
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
                      <Switch
                        className="mt-0.5"
                        checked={enabled}
                        onCheckedChange={(value) => handleLegalGateChange(gate.key, value)}
                        aria-label={`${gate.title} — ${enabled ? 'enabled' : 'disabled'}`}
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Public Transparency Page</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center justify-between">
                <p className="text-xs text-content-disabled">
                  When enabled, a public compliance page is visible to non-members.
                </p>
                <Switch
                  checked={form.transparency_enabled}
                  onCheckedChange={(value) => handleChange('transparency_enabled', value)}
                  aria-label={`Public transparency page — ${form.transparency_enabled ? 'enabled' : 'disabled'}`}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-status-danger-border">
            <CardHeader>
              <CardTitle className="text-status-danger">Danger Zone</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {openDeletionRequest ? (
                <AlertBanner
                  status="danger"
                  title="Deletion request in progress"
                  description={`This community is in its cooling-off period, ending ${new Date(openDeletionRequest.coolingEndsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`}
                  action={
                    <Button asChild variant="outline" size="sm">
                      <Link href="/deletion-requests">
                        View request
                        <ExternalLink size={14} aria-hidden="true" />
                      </Link>
                    </Button>
                  }
                />
              ) : (
                <p className="text-sm text-content-tertiary">
                  No deletion request is in progress for this community. Requesting deletion is
                  handled from the <Link href="/deletion-requests" className="text-content-link hover:text-content-link-hover underline underline-offset-2">Deletion Requests</Link> screen.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button type="submit" loading={saving}>
          <Save size={14} aria-hidden="true" />
          Save Changes
        </Button>
        <Button type="button" variant="outline" onClick={handleReset}>
          <RotateCcw size={14} aria-hidden="true" />
          Reset
        </Button>
        {error && <p className="text-sm text-status-danger" role="alert">{error}</p>}
        {success && <p className="text-sm text-status-success">Saved successfully</p>}
      </div>
    </form>
  );
}
