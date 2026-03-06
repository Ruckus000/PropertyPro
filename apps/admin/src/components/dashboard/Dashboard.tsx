'use client';

import Link from 'next/link';
import {
  Users,
  MonitorPlay,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  Clock,
  CreditCard,
} from 'lucide-react';

interface StaleDemoItem {
  id: number;
  prospect_name: string;
  template_type: string;
  created_at: string;
}

interface PastDueCommunity {
  id: number;
  name: string;
  slug: string;
  subscription_status: string;
  updated_at: string;
}

interface ActivityItem {
  type: 'community' | 'demo';
  id: string;
  label: string;
  action: string;
  timestamp: string;
  href: string;
}

interface DashboardProps {
  stats: {
    activeClients: number;
    activeDemos: number;
    staleDemos: number;
    newClientsThisMonth: number;
    pastDueCount: number;
  };
  actionItems: {
    staleDemos: StaleDemoItem[];
    pastDueCommunities: PastDueCommunity[];
  };
  activityFeed: ActivityItem[];
  pipeline: {
    demos: number;
    active: number;
  };
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function daysOld(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

function ageBadgeClass(days: number): string {
  if (days >= 30) return 'bg-red-100 text-red-800';
  if (days >= 20) return 'bg-orange-100 text-orange-800';
  if (days >= 10) return 'bg-yellow-100 text-yellow-800';
  return 'bg-green-100 text-green-800';
}

export function Dashboard({ stats, actionItems, activityFeed, pipeline }: DashboardProps) {
  const totalActionItems =
    (actionItems.staleDemos.length > 0 ? 1 : 0) +
    (actionItems.pastDueCommunities.length > 0 ? 1 : 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-0.5 text-sm text-gray-500">Platform overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Users size={16} />}
          label="Active Clients"
          value={stats.activeClients}
          detail={
            stats.newClientsThisMonth > 0
              ? `+${stats.newClientsThisMonth} this month`
              : 'No new clients this month'
          }
          detailColor={stats.newClientsThisMonth > 0 ? 'text-green-600' : 'text-gray-400'}
        />
        <StatCard
          icon={<MonitorPlay size={16} />}
          label="Active Demos"
          value={stats.activeDemos}
          detail={
            stats.staleDemos > 0
              ? `${stats.staleDemos} stale (10d+)`
              : 'All demos fresh'
          }
          detailColor={stats.staleDemos > 0 ? 'text-yellow-600' : 'text-green-600'}
        />
        <StatCard
          icon={<AlertTriangle size={16} />}
          label="Needs Attention"
          value={totalActionItems}
          detail={
            stats.pastDueCount > 0
              ? `${stats.pastDueCount} past due`
              : 'All clear'
          }
          detailColor={stats.pastDueCount > 0 ? 'text-red-600' : 'text-green-600'}
        />
        <StatCard
          icon={<TrendingUp size={16} />}
          label="Pipeline"
          value={`${pipeline.demos} → ${pipeline.active}`}
          detail="Demos → Active clients"
          detailColor="text-gray-400"
        />
      </div>

      {/* Action Items + Activity Feed */}
      <div className="grid gap-4 xl:grid-cols-5">
        {/* Action Items */}
        <div className="xl:col-span-3 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Action Items</h2>
            {totalActionItems > 0 && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                {totalActionItems}
              </span>
            )}
          </div>

          {totalActionItems === 0 ? (
            <div className="rounded-md bg-green-50 px-4 py-6 text-center">
              <p className="text-sm font-medium text-green-800">All clear!</p>
              <p className="mt-1 text-xs text-green-600">No items need your attention right now.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Stale demos */}
              {actionItems.staleDemos.length > 0 && (
                <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4">
                  <div className="flex items-start gap-3">
                    <Clock size={16} className="mt-0.5 shrink-0 text-yellow-600" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {actionItems.staleDemos.length} demo{actionItems.staleDemos.length !== 1 ? 's' : ''} older than 10 days
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {actionItems.staleDemos.slice(0, 5).map((d) => {
                          const days = daysOld(d.created_at);
                          return (
                            <span
                              key={d.id}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${ageBadgeClass(days)}`}
                            >
                              {d.prospect_name}
                              <span className="opacity-70">{days}d</span>
                            </span>
                          );
                        })}
                        {actionItems.staleDemos.length > 5 && (
                          <span className="text-xs text-gray-500">
                            +{actionItems.staleDemos.length - 5} more
                          </span>
                        )}
                      </div>
                      <Link
                        href="/demo"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        View Demos <ArrowRight size={12} />
                      </Link>
                    </div>
                  </div>
                </div>
              )}

              {/* Past due subscriptions */}
              {actionItems.pastDueCommunities.length > 0 && (
                <div className="rounded-md border border-red-200 bg-red-50 p-4">
                  <div className="flex items-start gap-3">
                    <CreditCard size={16} className="mt-0.5 shrink-0 text-red-600" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {actionItems.pastDueCommunities.length} subscription{actionItems.pastDueCommunities.length !== 1 ? 's' : ''} past due
                      </p>
                      <div className="mt-2 space-y-1.5">
                        {actionItems.pastDueCommunities.map((c) => (
                          <div key={c.id} className="flex items-center justify-between">
                            <span className="text-sm text-gray-700">{c.name}</span>
                            <Link
                              href={`/clients/${c.id}`}
                              className="text-xs font-medium text-blue-600 hover:text-blue-700"
                            >
                              View
                            </Link>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Activity Feed */}
        <div className="xl:col-span-2 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Recent Activity</h2>

          {activityFeed.length === 0 ? (
            <p className="text-sm text-gray-400">No recent activity</p>
          ) : (
            <div className="space-y-3">
              {activityFeed.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-start gap-3 rounded-md px-2 py-1.5 -mx-2 hover:bg-gray-50 transition-colors"
                >
                  <div
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                      item.type === 'community' ? 'bg-blue-500' : 'bg-purple-500'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate">
                      <span className="font-medium">{item.label}</span>{' '}
                      <span className="text-gray-500">{item.action}</span>
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatRelativeTime(item.timestamp)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pipeline */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Pipeline</h2>
        <div className="flex items-center gap-4">
          <PipelineStage label="Demos" count={pipeline.demos} color="bg-purple-500" />
          <ArrowRight size={16} className="shrink-0 text-gray-300" />
          <PipelineStage label="Active Clients" count={pipeline.active} color="bg-green-500" />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  detail,
  detailColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  detail: string;
  detailColor: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-gray-500 mb-1">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-gray-900">{value}</div>
      <p className={`mt-1 text-xs ${detailColor}`}>{detail}</p>
    </div>
  );
}

function PipelineStage({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="flex-1 rounded-lg border border-gray-100 bg-gray-50 p-4">
      <div className="flex items-center gap-2 mb-1">
        <div className={`h-2.5 w-2.5 rounded-full ${color}`} />
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className="text-2xl font-semibold text-gray-900">{count}</div>
      <div className="mt-2 flex gap-0.5">
        {Array.from({ length: Math.min(count, 20) }).map((_, i) => (
          <div key={i} className={`h-1.5 w-1.5 rounded-full ${color} opacity-60`} />
        ))}
      </div>
    </div>
  );
}
