'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import {
  Loader2,
  Mail,
  Building2,
  CheckCircle,
  Star,
  XCircle,
  Clock,
} from 'lucide-react';
import type { AdminLead, LeadStats, LeadStatus } from '@/lib/server/leads';

interface LeadsDashboardProps {
  initialLeads: AdminLead[];
  initialStats: LeadStats;
  initialStatusFilter?: string;
}

const STATUS_STYLES: Record<
  LeadStatus,
  { className: string; icon: typeof Clock; label: string }
> = {
  new: { className: 'bg-coral-100 text-coral-700', icon: Star, label: 'New' },
  contacted: { className: 'bg-blue-100 text-blue-700', icon: Mail, label: 'Contacted' },
  qualified: { className: 'bg-green-100 text-green-700', icon: CheckCircle, label: 'Qualified' },
  disqualified: { className: 'bg-gray-100 text-gray-600', icon: XCircle, label: 'Disqualified' },
};

const STATUS_ORDER: LeadStatus[] = ['new', 'contacted', 'qualified', 'disqualified'];

export function LeadsDashboard({
  initialLeads,
  initialStats,
  initialStatusFilter = 'all',
}: LeadsDashboardProps) {
  const [leads, setLeads] = useState<AdminLead[]>(initialLeads);
  const [stats, setStats] = useState<LeadStats>(initialStats);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter);
  const [savingId, setSavingId] = useState<number | null>(null);
  const hasHydrated = useRef(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/admin/leads?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message ?? 'Failed to load leads');
      }
      setLeads(data.leads);
      setStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    // Skip the first run — the server already rendered with initial data.
    if (!hasHydrated.current) {
      hasHydrated.current = true;
      return;
    }
    void fetchLeads();
  }, [fetchLeads]);

  async function setStatus(id: number, status: LeadStatus) {
    setSavingId(id);
    setError('');
    try {
      const res = await fetch('/api/admin/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? 'Failed to update lead');
      }
      await fetchLeads();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update lead');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total leads" value={stats.total} />
        <StatCard label="Untouched" value={stats.new} />
        <StatCard label="In ICP (25–149 units)" value={stats.inIcp} />
        <StatCard label="Last 7 days" value={stats.last7Days} />
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <label htmlFor="lead-status-filter" className="text-sm text-gray-600">
          Status
        </label>
        <select
          id="lead-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="all">All</option>
          {STATUS_ORDER.map((status) => (
            <option key={status} value={status}>
              {STATUS_STYLES[status].label}
            </option>
          ))}
        </select>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : null}
      </div>

      {error ? (
        <div role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* Table */}
      {leads.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-6 py-12 text-center">
          <Mail className="mx-auto h-8 w-8 text-gray-400" aria-hidden="true" />
          <h2 className="mt-3 text-sm font-medium text-gray-900">No leads yet</h2>
          <p className="mt-1 text-sm text-gray-500">
            Leads arrive from the compliance checker on the marketing site.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>Contact</Th>
                <Th>Association</Th>
                <Th>Units</Th>
                <Th>Obligation</Th>
                <Th>Received</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {leads.map((lead) => {
                const style = STATUS_STYLES[lead.status];
                const StatusIcon = style.icon;
                return (
                  <tr key={lead.id} className={lead.inIcp ? 'bg-coral-50/40' : undefined}>
                    <td className="px-4 py-3">
                      <a
                        href={`mailto:${lead.email}`}
                        className="font-medium text-coral-700 hover:underline"
                      >
                        {lead.email}
                      </a>
                      {lead.contactName ? (
                        <div className="text-xs text-gray-500">{lead.contactName}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {lead.associationName ? (
                        <span className="inline-flex items-center gap-1.5 text-gray-900">
                          <Building2 className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                          {lead.associationName}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                      {lead.associationType ? (
                        <div className="text-xs uppercase text-gray-500">
                          {lead.associationType}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {lead.unitCount ?? <span className="text-gray-400">—</span>}
                      {lead.inIcp ? (
                        <span className="ml-2 rounded-full bg-coral-100 px-2 py-0.5 text-xs font-medium text-coral-700">
                          ICP
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {lead.obligationRequired === null ? (
                        <span className="text-gray-400">—</span>
                      ) : lead.obligationRequired ? (
                        <span className="font-medium text-gray-900">Required</span>
                      ) : (
                        <span className="text-gray-500">Not required</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {format(new Date(lead.createdAt), 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}
                        >
                          <StatusIcon className="h-3 w-3" aria-hidden="true" />
                          {style.label}
                        </span>
                        <label htmlFor={`lead-status-${lead.id}`} className="sr-only">
                          Update status for {lead.email}
                        </label>
                        <select
                          id={`lead-status-${lead.id}`}
                          value={lead.status}
                          disabled={savingId === lead.id}
                          onChange={(e) => setStatus(lead.id, e.target.value as LeadStatus)}
                          className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                        >
                          {STATUS_ORDER.map((status) => (
                            <option key={status} value={status}>
                              {STATUS_STYLES[status].label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500"
    >
      {children}
    </th>
  );
}
