'use client';

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import {
  Loader2,
  CheckCircle,
  AlertTriangle,
  Clock,
  MinusCircle,
  Filter,
} from 'lucide-react';

type ComplianceStatus = 'met' | 'overdue' | 'pending' | 'not_applicable';

interface ComplianceItem {
  id: number;
  template_key: string;
  title: string;
  description: string | null;
  category: string;
  statute_reference: string | null;
  document_id: number | null;
  document_posted_at: string | null;
  deadline: string | null;
  is_conditional: boolean;
  is_applicable: boolean;
  status: ComplianceStatus;
}

interface ComplianceSummary {
  total: number;
  met: number;
  overdue: number;
  pending: number;
  notApplicable: number;
}

interface CommunityComplianceProps {
  communityId: number;
}

const STATUS_CONFIG: Record<ComplianceStatus, { label: string; icon: typeof CheckCircle; className: string; badgeClass: string }> = {
  met: {
    label: 'Met',
    icon: CheckCircle,
    className: 'text-status-success',
    badgeClass: 'bg-status-success-subtle text-status-success',
  },
  overdue: {
    label: 'Overdue',
    icon: AlertTriangle,
    className: 'text-status-danger',
    badgeClass: 'bg-status-danger-subtle text-status-danger',
  },
  pending: {
    label: 'Pending',
    icon: Clock,
    className: 'text-status-warning',
    badgeClass: 'bg-status-warning-subtle text-status-warning',
  },
  not_applicable: {
    label: 'N/A',
    icon: MinusCircle,
    className: 'text-content-disabled',
    badgeClass: 'bg-surface-muted text-content-tertiary',
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  governing_documents: 'Governing Documents',
  financial_records: 'Financial Records',
  meeting_records: 'Meeting Records',
  correspondence: 'Correspondence',
  contracts: 'Contracts & Bids',
};

export function CommunityCompliance({ communityId }: CommunityComplianceProps) {
  const [items, setItems] = useState<ComplianceItem[]>([]);
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<ComplianceStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const fetchCompliance = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/communities/${communityId}/compliance`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? 'Failed to load compliance data');
        return;
      }
      setItems(data.items);
      setSummary(data.summary);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => { fetchCompliance(); }, [fetchCompliance]);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 size={20} className="animate-spin text-content-disabled" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-status-danger-border bg-status-danger-bg p-4 text-sm text-status-danger">
        {error}
      </div>
    );
  }

  if (!summary || summary.total === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-edge-strong bg-surface-card">
        <p className="text-sm text-content-disabled">No compliance checklist items</p>
      </div>
    );
  }

  const categories = [...new Set(items.map((i) => i.category))].sort();
  const applicableTotal = summary.total - summary.notApplicable;
  const scorePercent = applicableTotal > 0 ? Math.round((summary.met / applicableTotal) * 100) : 0;

  const filteredItems = items.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-5">
        <div className="rounded-lg border border-edge bg-surface-card p-4 text-center shadow-e1">
          <p className="text-2xl font-semibold text-content">{scorePercent}%</p>
          <p className="text-xs text-content-tertiary">Score</p>
        </div>
        {(['met', 'overdue', 'pending', 'not_applicable'] as ComplianceStatus[]).map((status) => {
          const config = STATUS_CONFIG[status];
          const Icon = config.icon;
          const count = status === 'met' ? summary.met
            : status === 'overdue' ? summary.overdue
            : status === 'pending' ? summary.pending
            : summary.notApplicable;
          return (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
              className={`rounded-lg border p-4 text-center transition-colors ${
                statusFilter === status ? 'border-coral-300 bg-coral-50' : 'border-edge bg-surface-card hover:bg-surface-page'
              } shadow-e1`}
            >
              <div className="flex items-center justify-center gap-1.5">
                <Icon size={14} className={config.className} />
                <p className="text-2xl font-semibold text-content">{count}</p>
              </div>
              <p className="text-xs text-content-tertiary">{config.label}</p>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Filter size={14} className="text-content-disabled" />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded border border-edge-strong px-2 py-1 text-xs text-content-secondary"
        >
          <option value="all">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {CATEGORY_LABELS[cat] ?? cat.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        {(statusFilter !== 'all' || categoryFilter !== 'all') && (
          <button
            type="button"
            onClick={() => { setStatusFilter('all'); setCategoryFilter('all'); }}
            className="text-xs text-coral-700 hover:text-coral-700"
          >
            Clear filters
          </button>
        )}
        <span className="text-xs text-content-disabled">
          {filteredItems.length} of {items.length} items
        </span>
      </div>

      {/* Checklist Table */}
      <div className="overflow-hidden rounded-lg border border-edge bg-surface-card shadow-e1">
        <table className="min-w-full divide-y divide-edge">
          <thead className="bg-surface-page">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Requirement</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Category</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Statute</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Deadline</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">Document</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge-subtle">
            {filteredItems.map((item) => {
              const config = STATUS_CONFIG[item.status];
              const Icon = config.icon;
              return (
                <tr key={item.id} className="hover:bg-surface-page">
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.badgeClass}`}>
                      <Icon size={12} />
                      {config.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-content">{item.title}</p>
                    {item.description && (
                      <p className="mt-0.5 text-xs text-content-disabled line-clamp-2">{item.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-content-tertiary">
                    {CATEGORY_LABELS[item.category] ?? item.category.replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-content-tertiary">
                    {item.statute_reference ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-content-tertiary">
                    {item.deadline ? (
                      <span className={item.status === 'overdue' ? 'font-medium text-status-danger' : ''}>
                        {format(new Date(item.deadline), 'MMM d, yyyy')}
                      </span>
                    ) : (
                      <span className="text-content-disabled">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-content-tertiary">
                    {item.document_id ? (
                      <span className="text-status-success">Linked</span>
                    ) : (
                      <span className="text-content-disabled">Missing</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-content-disabled">
                  No items match the current filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
