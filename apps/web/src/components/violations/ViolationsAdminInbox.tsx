'use client';

/**
 * Admin violations inbox — list, filter, and manage violation cases.
 * Pattern follows AdminInbox.tsx from maintenance.
 */
import { useCallback, useEffect, useState } from 'react';
import type { AnyCommunityRole } from '@propertypro/shared';
import type { ViolationStatus, ViolationSeverity } from '@propertypro/db';
import { listViolations, type ViolationItem } from '@/lib/api/violations';
import { ViolationDetailPanel } from './ViolationDetailPanel';

const STATUS_OPTIONS: { value: ViolationStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'reported', label: 'Reported' },
  { value: 'noticed', label: 'Noticed' },
  { value: 'hearing_scheduled', label: 'Hearing Scheduled' },
  { value: 'fined', label: 'Fined' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
];

const SEVERITY_OPTIONS: { value: ViolationSeverity | ''; label: string }[] = [
  { value: '', label: 'All Severities' },
  { value: 'minor', label: 'Minor' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'major', label: 'Major' },
];

const STATUS_STYLES: Record<string, string> = {
  reported: 'bg-yellow-100 text-yellow-800',
  noticed: 'bg-blue-100 text-blue-800',
  hearing_scheduled: 'bg-purple-100 text-purple-800',
  fined: 'bg-red-100 text-red-800',
  resolved: 'bg-green-100 text-green-800',
  dismissed: 'bg-gray-100 text-gray-700',
};

const SEVERITY_STYLES: Record<string, string> = {
  minor: 'bg-yellow-100 text-yellow-800',
  moderate: 'bg-orange-100 text-orange-800',
  major: 'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<string, string> = {
  reported: 'Reported',
  noticed: 'Noticed',
  hearing_scheduled: 'Hearing Scheduled',
  fined: 'Fined',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

const CATEGORY_LABELS: Record<string, string> = {
  noise: 'Noise',
  parking: 'Parking',
  unauthorized_modification: 'Unauthorized Modification',
  pet: 'Pet Violation',
  trash: 'Trash / Debris',
  common_area_misuse: 'Common Area Misuse',
  landscaping: 'Landscaping',
  property_damage: 'Property Damage',
  other: 'Other',
};

const LIMIT = 20;

interface ViolationsAdminInboxProps {
  communityId: number;
  userId: string;
  userRole: AnyCommunityRole;
}

export function ViolationsAdminInbox({ communityId, userId, userRole }: ViolationsAdminInboxProps) {
  const [violations, setViolations] = useState<ViolationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<ViolationStatus | ''>('');
  const [selectedSeverity, setSelectedSeverity] = useState<ViolationSeverity | ''>('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchViolations = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listViolations(communityId, {
        status: selectedStatus || undefined,
        severity: selectedSeverity || undefined,
        page,
        limit: LIMIT,
      });
      setViolations(res.data);
      setTotal(res.meta?.total ?? res.data.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load violations');
    } finally {
      setLoading(false);
    }
  }, [communityId, selectedStatus, selectedSeverity, page]);

  useEffect(() => {
    void fetchViolations();
  }, [fetchViolations]);

  const handleFilterChange = useCallback((setter: (val: string) => void, value: string) => {
    setter(value);
    setPage(1);
    setExpandedId(null);
  }, []);

  const handleActionComplete = useCallback(() => {
    setExpandedId(null);
    void fetchViolations();
  }, [fetchViolations]);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <select
          value={selectedStatus}
          onChange={(e) => handleFilterChange(setSelectedStatus as (val: string) => void, e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={selectedSeverity}
          onChange={(e) => handleFilterChange(setSelectedSeverity as (val: string) => void, e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {SEVERITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <span className="ml-auto text-sm text-gray-500">
          {total} violation{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* List */}
      {loading && violations.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg border border-gray-200 bg-gray-50" />
          ))}
        </div>
      ) : violations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">
            {selectedStatus || selectedSeverity
              ? 'No violations match your filters. Try adjusting your filter criteria.'
              : 'No violations have been reported. When community members report violations, they will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {violations.map((v) => (
            <div key={v.id}>
              <button
                type="button"
                onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}
                className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                  expandedId === v.id
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      #{v.id}
                    </span>
                    <span className="text-sm text-gray-600">
                      Unit {v.unitId}
                    </span>
                    <span className="text-sm text-gray-600">
                      {CATEGORY_LABELS[v.category] ?? v.category}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[v.severity] ?? ''}`}>
                      {v.severity}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[v.status] ?? ''}`}>
                      {STATUS_LABELS[v.status] ?? v.status}
                    </span>
                  </div>
                  <time className="shrink-0 text-xs text-gray-400">
                    {new Date(v.createdAt).toLocaleDateString()}
                  </time>
                </div>
              </button>

              {expandedId === v.id && (
                <ViolationDetailPanel
                  violation={v}
                  communityId={communityId}
                  userId={userId}
                  userRole={userRole}
                  onActionComplete={handleActionComplete}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
