'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Building2,
  Users,
  FileText,
  MonitorPlay,
  ShieldCheck,
  AlertTriangle,
  DollarSign,
  Loader2,
  KeyRound,
  Trash2,
} from 'lucide-react';

interface Stats {
  overview: {
    communities: number;
    demos: number;
    members: number;
    documents: number;
  };
  billing: {
    active: number;
    trialing: number;
    past_due: number;
    canceled: number;
    none: number;
  };
  compliance: {
    averageScore: number | null;
    atRiskCount: number;
    totalTracked: number;
  };
  lifecycle?: {
    activeFreeAccess: number;
    pendingDeletions: number;
  };
}

export function PlatformDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/admin/stats');
        const data = await res.json();
        if (!res.ok) {
          setError(data.error?.message ?? 'Failed to load stats');
          return;
        }
        setStats(data);
      } catch {
        setError('Network error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error || 'Failed to load dashboard'}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Platform Overview */}
      <div>
        <h2 className="mb-4 text-sm font-semibold text-gray-700 uppercase tracking-wide">Platform Overview</h2>
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
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-e1">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={16} className="text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700">Billing Summary</h2>
          </div>
          <div className="space-y-3">
            <BillingRow label="Active" count={stats.billing.active} className="text-green-600" />
            <BillingRow label="Trialing" count={stats.billing.trialing} className="text-blue-600" />
            <BillingRow label="Past Due" count={stats.billing.past_due} className="text-yellow-600" highlight={stats.billing.past_due > 0} />
            <BillingRow label="Canceled" count={stats.billing.canceled} className="text-gray-500" />
            {stats.billing.none > 0 && (
              <BillingRow label="No Subscription" count={stats.billing.none} className="text-gray-400" />
            )}
          </div>
        </div>

        {/* Compliance Health */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-e1">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck size={16} className="text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700">Compliance Health</h2>
          </div>
          {stats.compliance.totalTracked > 0 ? (
            <div className="space-y-4">
              <div className="flex items-end gap-3">
                <div>
                  <p className="text-3xl font-semibold text-gray-900">
                    {stats.compliance.averageScore ?? 0}%
                  </p>
                  <p className="text-xs text-gray-500">Average compliance score</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-sm text-gray-500">
                    {stats.compliance.totalTracked} communities tracked
                  </p>
                </div>
              </div>
              {stats.compliance.atRiskCount > 0 && (
                <div className="flex items-center gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2">
                  <AlertTriangle size={14} className="text-yellow-600" />
                  <p className="text-sm text-yellow-700">
                    <span className="font-medium">{stats.compliance.atRiskCount}</span>{' '}
                    {stats.compliance.atRiskCount === 1 ? 'community' : 'communities'} below 70% compliance
                  </p>
                </div>
              )}
              {stats.compliance.atRiskCount === 0 && (
                <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2">
                  <ShieldCheck size={14} className="text-green-600" />
                  <p className="text-sm text-green-700">All communities at or above 70% compliance</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No compliance data available</p>
          )}
        </div>
      </div>

      {/* Account Lifecycle */}
      {stats.lifecycle && (stats.lifecycle.activeFreeAccess > 0 || stats.lifecycle.pendingDeletions > 0) && (
        <div>
          <h2 className="mb-4 text-sm font-semibold text-gray-700 uppercase tracking-wide">Account Lifecycle</h2>
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
        <h2 className="mb-4 text-sm font-semibold text-gray-700 uppercase tracking-wide">Quick Actions</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Link
            href="/clients"
            className="rounded-lg border border-gray-200 bg-white p-4 text-center hover:border-blue-300 hover:bg-blue-50 transition-colors shadow-e1"
          >
            <Building2 size={20} className="mx-auto mb-2 text-gray-500" />
            <p className="text-sm font-medium text-gray-700">View Clients</p>
          </Link>
          <Link
            href="/demo/new"
            className="rounded-lg border border-gray-200 bg-white p-4 text-center hover:border-blue-300 hover:bg-blue-50 transition-colors shadow-e1"
          >
            <MonitorPlay size={20} className="mx-auto mb-2 text-gray-500" />
            <p className="text-sm font-medium text-gray-700">Create Demo</p>
          </Link>
          <Link
            href="/settings"
            className="rounded-lg border border-gray-200 bg-white p-4 text-center hover:border-blue-300 hover:bg-blue-50 transition-colors shadow-e1"
          >
            <Users size={20} className="mx-auto mb-2 text-gray-500" />
            <p className="text-sm font-medium text-gray-700">Manage Admins</p>
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
    <div className={`rounded-lg border border-gray-200 bg-white p-5 shadow-e1 ${href ? 'hover:border-blue-300 hover:bg-blue-50 transition-colors' : ''}`}>
      <div className="flex items-center gap-2 text-gray-500 mb-1">
        <Icon size={16} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-gray-900">{value.toLocaleString()}</p>
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
    <div className={`flex items-center justify-between rounded px-3 py-2 ${highlight ? 'bg-yellow-50 border border-yellow-200' : ''}`}>
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm font-semibold ${className}`}>{count}</span>
    </div>
  );
}
