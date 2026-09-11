'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Loader2, Mail, Building2 } from 'lucide-react';
import { Badge, KpiCard, QuickFilterTabs } from '@propertypro/ui';
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
const MUTED = 'text-content-tertiary';
const FAINT = 'text-content-disabled';
const BODY = 'text-content';
const CELL = 'px-4 py-3';
const INPUT = 'rounded-md border border-edge-strong focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus';

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  disqualified: 'Disqualified',
};

const STATUS_ORDER: LeadStatus[] = ['new', 'contacted', 'qualified', 'disqualified'];

const SOURCE_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All sources' },
  { value: 'compliance_checker', label: 'Compliance checker' },
  { value: 'pm_inquiry', label: 'Portfolio inquiry' },
];

/** QuickFilterTabs value — "all" plus the three triage stages an operator
 * actively works. `disqualified` stays reachable from the per-row status
 * select but doesn't get its own tab; it's a terminal state, not a queue. */
const STATUS_TABS: { value: 'all' | 'new' | 'contacted' | 'qualified'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
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

  // Source changes the underlying dataset (and the stats derived from it), so
  // it stays a server round-trip. Status is a client-side view over whatever
  // is already loaded — QuickFilterTabs needs live per-tab counts, and a
  // server round-trip per tab click would make those counts lag the click.
  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
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
  }, [sourceFilter]);

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

  const tabCounts = useMemo(
    () => ({
      all: leads.length,
      new: leads.filter((lead) => lead.status === 'new').length,
      contacted: leads.filter((lead) => lead.status === 'contacted').length,
      qualified: leads.filter((lead) => lead.status === 'qualified').length,
    }),
    [leads],
  );

  const visibleLeads = useMemo(
    () => (statusFilter === 'all' ? leads : leads.filter((lead) => lead.status === statusFilter)),
    [leads, statusFilter],
  );

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard title="Untouched" value={stats.new} />
        <KpiCard title="In ICP" value={stats.inIcp} />
        <KpiCard title="Last 7 days" value={stats.last7Days} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <QuickFilterTabs
          tabs={STATUS_TABS.map((tab) => ({ ...tab, count: tabCounts[tab.value] }))}
          active={statusFilter}
          onChange={setStatusFilter}
        />

        <div className="flex items-center gap-3">
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

          {loading ? <Loader2 className={`h-4 w-4 animate-spin ${FAINT}`} aria-hidden="true" /> : null}
        </div>
      </div>

      {error ? (
        <div role="alert" className="rounded-md bg-status-danger-bg px-4 py-3 text-sm text-status-danger">
          {error}
        </div>
      ) : null}

      {/* Table */}
      {visibleLeads.length === 0 ? (
        <div className="rounded-lg border border-dashed border-edge-strong px-6 py-12 text-center">
          <Mail className={`mx-auto h-8 w-8 ${FAINT}`} aria-hidden="true" />
          <h2 className={`mt-3 text-sm font-medium ${BODY}`}>No leads yet</h2>
          <p className={`mt-1 text-sm ${MUTED}`}>
            Leads arrive from the compliance checker and the portfolio inquiry
            form on the marketing site.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-edge">
          <table className="min-w-full divide-y divide-edge text-sm">
            <thead className="bg-surface-page">
              <tr>
                <Th>Association</Th>
                <Th>Contact</Th>
                <Th>Details</Th>
                <Th>Status</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge bg-surface-card">
              {visibleLeads.map((lead) => (
                <tr key={lead.id} className={lead.inIcp ? 'bg-coral-50/40' : undefined}>
                  <td className={CELL}>
                    {lead.associationName ? (
                      <span className={`inline-flex items-center gap-1.5 font-medium ${BODY}`}>
                        <Building2 className={`h-3.5 w-3.5 ${FAINT}`} aria-hidden="true" />
                        {lead.associationName}
                      </span>
                    ) : (
                      <Dash />
                    )}
                    <div className="mt-1 flex items-center gap-1.5">
                      {lead.associationType ? (
                        <span className={`text-xs uppercase ${MUTED}`}>{lead.associationType}</span>
                      ) : null}
                      {lead.inIcp ? (
                        <Badge variant="brand" size="sm">
                          ICP
                        </Badge>
                      ) : null}
                    </div>
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
                  <td className={CELL}>
                    {lead.contactName ? (
                      <div className={BODY}>{lead.contactName}</div>
                    ) : null}
                    <a
                      href={`mailto:${lead.email}`}
                      className="font-medium text-coral-700 hover:underline"
                    >
                      {lead.email}
                    </a>
                  </td>
                  <td className={`${CELL} ${MUTED}`}>
                    {lead.communityCount !== null ? `${lead.communityCount} communities` : lead.unitCount !== null ? `${lead.unitCount} units` : '—'}
                    {' · '}
                    {labelForSource(lead.source)}
                    {' · '}
                    {lead.obligationRequired === null
                      ? '—'
                      : lead.obligationRequired
                        ? 'Obligation required'
                        : 'No obligation'}
                    {' · '}
                    {format(new Date(lead.createdAt), 'MMM d, yyyy')}
                  </td>
                  <td className={CELL}>
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
                          {STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={`${CELL} text-right`}>
                    {/*
                      ponytail: /demo/new does not read `?lead=` yet — a later
                      program wires the wizard to prefill prospect details from
                      the originating lead. For now this link carries the id
                      but nothing on the receiving end consumes it.
                    */}
                    <Link
                      href={`/demo/new?lead=${lead.id}`}
                      className="text-xs font-medium text-coral-700 hover:underline"
                    >
                      Create demo
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
