'use client';

import { useState } from 'react';
import {
  Building2,
  MonitorPlay,
  Shield,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { Badge, Button, Input, PageBody } from '@propertypro/ui';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { AlertPrefsSection } from '@/components/settings/AlertPrefsSection';
import { InstallAppSection } from '@/components/settings/InstallAppSection';
import {
  IntegrationsSection,
  type IntegrationsSectionProps,
} from '@/components/settings/IntegrationsSection';
import { PushToggle } from '@/components/settings/PushToggle';
import type { AlertPrefs } from '@/lib/preferences/alert-prefs';

interface PlatformAdmin {
  userId: string;
  email: string;
  role: string;
  invitedBy: string | null;
  createdAt: string;
}

interface PlatformStats {
  communityCount: number;
  demoCount: number;
}

interface PlatformSettingsProps {
  currentAdmin: { id: string; email: string; role: string };
  admins: PlatformAdmin[];
  stats: PlatformStats;
  /** This operator's own alert opt-ins — see `AlertPrefsSection`. */
  alertPrefs: AlertPrefs;
  /**
   * Third-party reachability and the Stripe key's mode, computed on the server
   * from the CACHED health report — see `IntegrationsSection`.
   */
  integrations: IntegrationsSectionProps;
}

export function PlatformSettings({
  currentAdmin,
  admins: initialAdmins,
  stats,
  alertPrefs,
  integrations,
}: PlatformSettingsProps) {
  const [admins, setAdmins] = useState(initialAdmins);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError('');
    setAddLoading(true);

    try {
      const res = await fetch('/api/admin/platform-admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addEmail }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAddError(data.error?.message ?? 'Failed to add admin');
        return;
      }

      setAdmins((prev) => [...prev, data.admin]);
      setAddEmail('');
      setShowAddForm(false);
    } catch {
      setAddError('Network error');
    } finally {
      setAddLoading(false);
    }
  }

  async function handleRemove(userId: string) {
    setRemoveLoading(true);
    try {
      const res = await fetch(`/api/admin/platform-admins/${userId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setAdmins((prev) => prev.filter((a) => a.userId !== userId));
      }
    } finally {
      setRemoveLoading(false);
      setRemoveId(null);
    }
  }

  // Icons are uniformly secondary rather than one accent hue per card. Two
  // reasons, both from the design system rather than from token availability:
  // web's canonical KpiCard renders its icon `text-content-secondary` on a
  // muted chip, and DESIGN.md's Accent Scarcity rule reserves brand coral for
  // primary actions, focus rings and active nav — so the coral card was off-rule
  // too, not just the violet and emerald ones. The label already distinguishes
  // these cards; colour was carrying no information.
  const statCards = [
    { label: 'Communities', value: stats.communityCount, icon: Building2 },
    { label: 'Demo Instances', value: stats.demoCount, icon: MonitorPlay },
    { label: 'Platform Admins', value: admins.length, icon: Shield },
  ];

  return (
    <PageBody spacing="loose">
      <AdminPageHeader title="Settings" description="Platform administrators, alerts and integrations." />

      {/* Stats */}
      <section>
        <h2 className="text-sm font-medium text-content-tertiary uppercase tracking-wide mb-3">
          Platform Overview
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {statCards.map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="flex items-center gap-4 rounded-lg border border-edge bg-surface-card p-5 shadow-e1"
            >
              <div className="rounded-lg bg-surface-muted p-2.5 text-content-secondary">
                <Icon size={20} aria-hidden="true" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-content">{value}</p>
                <p className="text-sm text-content-tertiary">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Admin Management */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-content-tertiary uppercase tracking-wide">
            Platform Administrators
          </h2>
          {!showAddForm && (
            <Button size="sm" onClick={() => setShowAddForm(true)}>
              <Plus size={14} aria-hidden="true" />
              Add Admin
            </Button>
          )}
        </div>

        {/* Add form */}
        {showAddForm && (
          <form onSubmit={handleAdd} className="mb-4 flex items-start gap-3">
            <div className="flex-1">
              <Input
                type="email"
                placeholder="Email address"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                required
              />
              {addError && (
                <p className="mt-1 text-xs text-status-danger">{addError}</p>
              )}
            </div>
            <Button type="submit" size="sm" loading={addLoading}>
              Add
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => { setShowAddForm(false); setAddError(''); setAddEmail(''); }}
              aria-label="Cancel adding an admin"
            >
              <X size={16} aria-hidden="true" />
            </Button>
          </form>
        )}

        {/* Admin list */}
        <div className="divide-y divide-edge overflow-hidden rounded-lg border border-edge bg-surface-card shadow-e1">
          {admins.map((admin) => {
            const isSelf = admin.userId === currentAdmin.id;
            return (
              <div
                key={admin.userId}
                className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${isSelf ? 'bg-coral-50/50' : 'hover:bg-surface-page'}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-content">{admin.email}</span>
                    {isSelf && (
                      <Badge variant="info" size="sm">
                        You
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-content-tertiary">
                    <span className="capitalize">{admin.role.replace('_', ' ')}</span>
                    {' · Added '}
                    {new Date(admin.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <div className="shrink-0">
                  {isSelf ? (
                    <span className="text-xs text-content-disabled">—</span>
                  ) : removeId === admin.userId ? (
                    <div className="inline-flex items-center gap-2">
                      <span className="text-xs text-content-tertiary">Remove?</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto px-2 py-1 text-status-danger hover:bg-status-danger-bg hover:text-status-danger"
                        disabled={removeLoading}
                        onClick={() => handleRemove(admin.userId)}
                      >
                        {removeLoading ? 'Removing…' : 'Yes'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto px-2 py-1"
                        onClick={() => setRemoveId(null)}
                      >
                        No
                      </Button>
                    </div>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => setRemoveId(admin.userId)}>
                      <Trash2 size={12} aria-hidden="true" />
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <AlertPrefsSection initial={alertPrefs} />

      {/* Directly under the alert opt-ins it delivers: those five choose WHAT
          is worth telling this operator, this one chooses whether THIS browser
          is one of the places they are told. */}
      <PushToggle />

      <InstallAppSection />

      <IntegrationsSection {...integrations} />
    </PageBody>
  );
}
