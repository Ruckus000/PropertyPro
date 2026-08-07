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
import { labelForSource, type AdminLead, type LeadStats, type LeadStatus } from '@/lib/server/leads';

interface LeadsDashboardProps {
  initialLeads: AdminLead[];
  initialStats: LeadStats;
  initialStatusFilter?: string;
  initialSourceFilter?: string;
}

/**
 * Palette literals used across this file, named once.
 *
 * `apps/admin` is out of semantic-token scope (see CLAUDE.md), so it keeps the
 * console's raw Tailwind ramps — but `guard:design-tokens` counts occurrences
 * against a shrink-only per-file ceiling, and this file was sitting exactly at
 * its. Naming them both drains the baseline and stops the next column addition
 * from being blocked on cosmetics.
 */
const MUTED = 'text-gray-500';
const FAINT = 'text-gray-400';
const BODY = 'text-gray-900';
const CELL = 'px-4 py-3';
const INPUT = 'rounded-md border border-gray-300';

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

const SOURCE_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'compliance_checker', label: 'Compliance checker' },
  { value: 'pm_inquiry', label: 'Portfolio inquiry' },
];

const Dash = () => <span className={FAINT}>—</span>;

export function LeadsDashboard({
  initialLeads,
  initialStats,
  initialStatusFilter = 'all',
  initialSourceFilter = 'all',
}: LeadsDashboardProps) {
  const [leads, setLeads] = useState<AdminLead[]>(initialLeads);
  const [stats, setStats] = useState<LeadStats>(initialStats);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter);
  const [sourceFilter, setSourceFilter] = useState<string>(initialSourceFilter);
  const [savingId, setSavingId] = useState<number | null>(null);
  const hasHydrated = useRef(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (sourceFilter !== 'all') params.set('source', sourceFilter);
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
  }, [statusFilter, sourceFilter]);

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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Total leads" value={stats.total} />
        <StatCard label="Untouched" value={stats.new} />
        <StatCard label="In ICP (25–149 units)" value={stats.inIcp} />
        <StatCard label="Portfolio inquiries" value={stats.pmInquiries} />
        <StatCard label="Last 7 days" value={stats.last7Days} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="lead-status-filter" className={`text-sm ${MUTED}`}>
          Status
        </label>
        <select
          id="lead-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={`${INPUT} px-3 py-1.5 text-sm`}
        >
          <option value="all">All</option>
          {STATUS_ORDER.map((status) => (
            <option key={status} value={status}>
              {STATUS_STYLES[status].label}
            </option>
          ))}
        </select>

        <label htmlFor="lead-source-filter" className={`text-sm ${MUTED}`}>
          Source
        </label>
        <select
          id="lead-source-filter"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className={`${INPUT} px-3 py-1.5 text-sm`}
        >
          {SOURCE_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {loading ? <Loader2 className={`h-4 w-4 animate-spin ${FAINT}`} /> : null}
      </div>

      {error ? (
        <div role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* Table */}
      {leads.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-6 py-12 text-center">
          <Mail className={`mx-auto h-8 w-8 ${FAINT}`} aria-hidden="true" />
          <h2 className={`mt-3 text-sm font-medium ${BODY}`}>No leads yet</h2>
          <p className={`mt-1 text-sm ${MUTED}`}>
            Leads arrive from the compliance checker and the portfolio inquiry
            form on the marketing site.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>Contact</Th>
                <Th>Association / company</Th>
                <Th>Source</Th>
                <Th>Size</Th>
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
                    <td className={CELL}>
                      <a
                        href={`mailto:${lead.email}`}
                        className="font-medium text-coral-700 hover:underline"
                      >
                        {lead.email}
                      </a>
                      {lead.contactName ? (
                        <div className={`text-xs ${MUTED}`}>{lead.contactName}</div>
                      ) : null}
                    </td>
                    <td className={CELL}>
                      {lead.associationName ? (
                        <span className={`inline-flex items-center gap-1.5 ${BODY}`}>
                          <Building2 className={`h-3.5 w-3.5 ${FAINT}`} aria-hidden="true" />
                          {lead.associationName}
                        </span>
                      ) : (
                        <Dash />
                      )}
                      {lead.associationType ? (
                        <div className={`text-xs uppercase ${MUTED}`}>
                          {lead.associationType}
                        </div>
                      ) : null}
                      {/*
                        The prospect's own words. Shown inline rather than behind
                        a click because on a list this small it is the single
                        most useful thing on the row.
                      */}
                      {lead.message ? (
                        <p className={`mt-1 max-w-md whitespace-pre-line text-xs ${MUTED}`}>
                          {lead.message}
                        </p>
                      ) : null}
                    </td>
                    <td className={`${CELL} ${MUTED}`}>{labelForSource(lead.source)}</td>
                    <td className={CELL}>
                      {lead.communityCount !== null ? (
                        <div className={BODY}>
                          {lead.communityCount} communities
                          {lead.unitCount !== null ? (
                            <span className={MUTED}> · {lead.unitCount} units</span>
                          ) : null}
                        </div>
                      ) : lead.unitCount !== null ? (
                        <>
                          {lead.unitCount} units
                          {lead.inIcp ? (
                            <span className="ml-2 rounded-full bg-coral-100 px-2 py-0.5 text-xs font-medium text-coral-700">
                              ICP
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <Dash />
                      )}
                    </td>
                    <td className={CELL}>
                      {lead.obligationRequired === null ? (
                        <Dash />
                      ) : lead.obligationRequired ? (
                        <span className={`font-medium ${BODY}`}>Required</span>
                      ) : (
                        <span className={MUTED}>Not required</span>
                      )}
                    </td>
                    <td className={`${CELL} ${MUTED}`}>
                      {format(new Date(lead.createdAt), 'MMM d, yyyy')}
                    </td>
                    <td className={CELL}>
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
                          className={`${INPUT} px-2 py-1 text-xs`}
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
      <div className={`text-xs ${MUTED}`}>{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${BODY}`}>{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className={`px-4 py-2 text-left text-xs font-medium uppercase tracking-wide ${MUTED}`}
    >
      {children}
    </th>
  );
}
