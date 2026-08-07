import Link from 'next/link';
import {
  Building2,
  Users,
  FileText,
  MonitorPlay,
  ShieldCheck,
  AlertTriangle,
  DollarSign,
  KeyRound,
  Trash2,
} from 'lucide-react';
import type { PlatformDashboardStats } from '@/lib/server/dashboard';

interface PlatformDashboardProps {
  stats: PlatformDashboardStats;
}

export function PlatformDashboard({ stats }: PlatformDashboardProps) {
  return (
    <div className="space-y-8">
      {/* Platform Overview */}
      <div>
        <h2 className="mb-4 text-sm font-semibold text-content-secondary uppercase tracking-wide">Platform Overview</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Building2} label="Communities" value={stats.overview.communities} href="/clients" />
          <StatCard icon={Users} label="Total Members" value={stats.overview.members} />
          <StatCard icon={FileText} label="Documents" value={stats.overview.documents} />
          <StatCard icon={MonitorPlay} label="Active Demos" value={stats.overview.demos} href="/demo" />
        </div>
      </div>

      {/* Billing & Compliance side by side */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Billing Summary */}
        <div className="rounded-lg border border-edge bg-surface-card p-5 shadow-e1">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={16} className="text-content-tertiary" />
            <h2 className="text-sm font-semibold text-content-secondary">Billing Summary</h2>
          </div>
          <div className="space-y-3">
            <BillingRow label="Active" count={stats.billing.active} className="text-status-success" />
            <BillingRow label="Trialing" count={stats.billing.trialing} className="text-coral-700" />
            <BillingRow label="Past Due" count={stats.billing.past_due} className="text-status-warning" highlight={stats.billing.past_due > 0} />
            <BillingRow label="Canceled" count={stats.billing.canceled} className="text-content-tertiary" />
            {stats.billing.none > 0 && (
              <BillingRow label="No Subscription" count={stats.billing.none} className="text-content-disabled" />
            )}
          </div>
        </div>

        {/* Compliance Health */}
        <div className="rounded-lg border border-edge bg-surface-card p-5 shadow-e1">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck size={16} className="text-content-tertiary" />
            <h2 className="text-sm font-semibold text-content-secondary">Compliance Health</h2>
          </div>
          {stats.compliance.totalTracked > 0 ? (
            <div className="space-y-4">
              <div className="flex items-end gap-3">
                <div>
                  <p className="text-3xl font-semibold text-content">
                    {stats.compliance.averageScore ?? 0}%
                  </p>
                  <p className="text-xs text-content-tertiary">Average compliance score</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-sm text-content-tertiary">
                    {stats.compliance.totalTracked} communities tracked
                  </p>
                </div>
              </div>
              {stats.compliance.atRiskCount > 0 && (
                <div className="flex items-center gap-2 rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2">
                  <AlertTriangle size={14} className="text-status-warning" />
                  <p className="text-sm text-status-warning">
                    <span className="font-medium">{stats.compliance.atRiskCount}</span>{' '}
                    {stats.compliance.atRiskCount === 1 ? 'community' : 'communities'} below 70% compliance
                  </p>
                </div>
              )}
              {stats.compliance.atRiskCount === 0 && (
                <div className="flex items-center gap-2 rounded-md border border-status-success-border bg-status-success-bg px-3 py-2">
                  <ShieldCheck size={14} className="text-status-success" />
                  <p className="text-sm text-status-success">All communities at or above 70% compliance</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-content-disabled">No compliance data available</p>
          )}
        </div>
      </div>

      {/* Account Lifecycle */}
      {(stats.lifecycle.activeFreeAccess > 0 || stats.lifecycle.pendingDeletions > 0) && (
        <div>
          <h2 className="mb-4 text-sm font-semibold text-content-secondary uppercase tracking-wide">Account Lifecycle</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard icon={KeyRound} label="Active Free Access" value={stats.lifecycle.activeFreeAccess} />
            <StatCard
              icon={Trash2}
              label="Pending Deletions"
              value={stats.lifecycle.pendingDeletions}
              href={stats.lifecycle.pendingDeletions > 0 ? '/deletion-requests' : undefined}
            />
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="mb-4 text-sm font-semibold text-content-secondary uppercase tracking-wide">Quick Actions</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Link
            href="/clients"
            className="rounded-lg border border-edge bg-surface-card p-4 text-center hover:border-coral-300 hover:bg-coral-50 transition-colors shadow-e1"
          >
            <Building2 size={20} className="mx-auto mb-2 text-content-tertiary" />
            <p className="text-sm font-medium text-content-secondary">View Clients</p>
          </Link>
          <Link
            href="/demo/new"
            className="rounded-lg border border-edge bg-surface-card p-4 text-center hover:border-coral-300 hover:bg-coral-50 transition-colors shadow-e1"
          >
            <MonitorPlay size={20} className="mx-auto mb-2 text-content-tertiary" />
            <p className="text-sm font-medium text-content-secondary">Create Demo</p>
          </Link>
          <Link
            href="/settings"
            className="rounded-lg border border-edge bg-surface-card p-4 text-center hover:border-coral-300 hover:bg-coral-50 transition-colors shadow-e1"
          >
            <Users size={20} className="mx-auto mb-2 text-content-tertiary" />
            <p className="text-sm font-medium text-content-secondary">Manage Admins</p>
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Building2;
  label: string;
  value: number;
  href?: string;
}) {
  const content = (
    <div className={`rounded-lg border border-edge bg-surface-card p-5 shadow-e1 ${href ? 'hover:border-coral-300 hover:bg-coral-50 transition-colors' : ''}`}>
      <div className="flex items-center gap-2 text-content-tertiary mb-1">
        <Icon size={16} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-content">{value.toLocaleString()}</p>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

function BillingRow({
  label,
  count,
  className,
  highlight,
}: {
  label: string;
  count: number;
  className: string;
  highlight?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between rounded px-3 py-2 ${highlight ? 'bg-status-warning-bg border border-status-warning-border' : ''}`}>
      <span className="text-sm text-content-secondary">{label}</span>
      <span className={`text-sm font-semibold ${className}`}>{count}</span>
    </div>
  );
}
