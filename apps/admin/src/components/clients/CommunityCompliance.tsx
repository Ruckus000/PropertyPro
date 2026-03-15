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
    className: 'text-green-600',
    badgeClass: 'bg-green-100 text-green-700',
  },
  overdue: {
    label: 'Overdue',
    icon: AlertTriangle,
    className: 'text-red-600',
    badgeClass: 'bg-red-100 text-red-700',
  },
  pending: {
    label: 'Pending',
    icon: Clock,
    className: 'text-yellow-600',
    badgeClass: 'bg-yellow-100 text-yellow-700',
  },
  not_applicable: {
    label: 'N/A',
    icon: MinusCircle,
    className: 'text-gray-400',
    badgeClass: 'bg-gray-100 text-gray-500',
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
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!summary || summary.total === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white">
        <p className="text-sm text-gray-400">No compliance checklist items</p>
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
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-e1">
          <p className="text-2xl font-semibold text-gray-900">{scorePercent}%</p>
          <p className="text-xs text-gray-500">Score</p>
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
                statusFilter === status ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'
              } shadow-e1`}
            >
              <div className="flex items-center justify-center gap-1.5">
                <Icon size={14} className={config.className} />
                <p className="text-2xl font-semibold text-gray-900">{count}</p>
              </div>
              <p className="text-xs text-gray-500">{config.label}</p>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Filter size={14} className="text-gray-400" />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600"
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
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            Clear filters
          </button>
        )}
        <span className="text-xs text-gray-400">
          {filteredItems.length} of {items.length} items
        </span>
      </div>

      {/* Checklist Table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-e1">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Requirement</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Category</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Statute</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Deadline</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Document</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredItems.map((item) => {
              const config = STATUS_CONFIG[item.status];
              const Icon = config.icon;
              return (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.badgeClass}`}>
                      <Icon size={12} />
                      {config.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{item.title}</p>
                    {item.description && (
                      <p className="mt-0.5 text-xs text-gray-400 line-clamp-2">{item.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {CATEGORY_LABELS[item.category] ?? item.category.replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-500">
                    {item.statute_reference ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {item.deadline ? (
                      <span className={item.status === 'overdue' ? 'font-medium text-red-600' : ''}>
                        {format(new Date(item.deadline), 'MMM d, yyyy')}
                      </span>
                    ) : (
                      <span className="text-gray-300">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {item.document_id ? (
                      <span className="text-green-600">Linked</span>
                    ) : (
                      <span className="text-gray-300">Missing</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
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
