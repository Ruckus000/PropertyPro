'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertBanner } from '@/components/shared/alert-banner';

/* ─────── Types ─────── */

interface Assessment {
  id: number;
  communityId: number;
  title: string;
  description: string | null;
  amountCents: number;
  frequency: 'monthly' | 'quarterly' | 'annual' | 'one_time';
  dueDay: number | null;
  lateFeeAmountCents: number;
  lateFeeDaysGrace: number;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  createdAt: string;
}

interface LineItem {
  id: number;
  assessmentId: number | null;
  unitId: number;
  amountCents: number;
  dueDate: string;
  status: 'pending' | 'paid' | 'overdue' | 'waived';
  lateFeeCents: number;
  paidAt: string | null;
}

interface AssessmentManagerProps {
  communityId: number;
  userId: string;
  userRole: string;
}

/* ─────── Helpers ─────── */

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
  one_time: 'One-Time',
};

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-status-warning-bg text-status-warning',
  overdue: 'bg-status-danger-bg text-status-danger',
  paid: 'bg-status-success-bg text-status-success',
  waived: 'bg-surface-muted text-content-secondary',
};

/* ─────── Fetch ─────── */

async function fetchAssessments(communityId: number): Promise<Assessment[]> {
  const res = await fetch(`/api/v1/assessments?communityId=${communityId}`);
  if (!res.ok) throw new Error('Failed to load assessments');
  const json = await res.json();
  return json.data;
}

async function fetchLineItems(communityId: number, assessmentId: number): Promise<LineItem[]> {
  const res = await fetch(`/api/v1/assessments/${assessmentId}/line-items?communityId=${communityId}`);
  if (!res.ok) throw new Error('Failed to load line items');
  const json = await res.json();
  return json.data;
}

async function createAssessment(
  communityId: number,
  data: {
    title: string;
    description: string;
    amountCents: number;
    frequency: string;
    dueDay: number | null;
    lateFeeAmountCents: number;
    lateFeeDaysGrace: number;
  },
): Promise<Assessment> {
  const res = await fetch('/api/v1/assessments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ communityId, ...data }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message || 'Failed to create assessment');
  }
  const json = await res.json();
  return json.data;
}

/* ─────── Main Component ─────── */

export function AssessmentManager({ communityId, userId, userRole }: AssessmentManagerProps) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null);

  const { data: assessments, isLoading, isError } = useQuery({
    queryKey: ['assessments', communityId],
    queryFn: () => fetchAssessments(communityId),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-10 w-48 rounded bg-surface-muted" />
        <div className="h-64 rounded-md bg-surface-muted" />
      </div>
    );
  }

  if (isError) {
    return (
      <AlertBanner status="danger" title="Failed to load assessments." />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-content">Assessments</h2>
          <p className="text-sm text-content-secondary">Create and manage community assessments and dues.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-content-inverse hover:bg-indigo-700"
        >
          Create Assessment
        </button>
      </div>

      {/* Assessment List */}
      {assessments && assessments.length === 0 ? (
        <div className="rounded-md border border-edge bg-surface-card p-8 text-center">
          <p className="text-sm text-content-tertiary">No assessments created yet.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            Create your first assessment
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {assessments?.map((assessment) => (
            <AssessmentCard
              key={assessment.id}
              assessment={assessment}
              onClick={() => setSelectedAssessment(assessment)}
              isSelected={selectedAssessment?.id === assessment.id}
            />
          ))}
        </div>
      )}

      {/* Line Items Detail */}
      {selectedAssessment && (
        <LineItemsPanel
          communityId={communityId}
          assessment={selectedAssessment}
          onClose={() => setSelectedAssessment(null)}
        />
      )}

      {/* Create Dialog */}
      {showCreate && (
        <CreateAssessmentDialog
          communityId={communityId}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            queryClient.invalidateQueries({ queryKey: ['assessments', communityId] });
          }}
        />
      )}
    </div>
  );
}

/* ─────── Assessment Card ─────── */

function AssessmentCard({
  assessment,
  onClick,
  isSelected,
}: {
  assessment: Assessment;
  onClick: () => void;
  isSelected: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-md border bg-surface-card p-4 text-left transition-colors duration-quick hover:border-indigo-300 ${
        isSelected ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-edge'
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-content">{assessment.title}</h3>
          {assessment.description && (
            <p className="mt-0.5 text-sm text-content-tertiary line-clamp-1">{assessment.description}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-content">{formatCents(assessment.amountCents)}</p>
          <p className="text-xs text-content-tertiary">{FREQUENCY_LABELS[assessment.frequency] || assessment.frequency}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-content-tertiary">
        <span className={`inline-flex rounded-full px-2 py-0.5 font-medium ${assessment.isActive ? 'bg-status-success-bg text-status-success' : 'bg-surface-muted text-content-secondary'}`}>
          {assessment.isActive ? 'Active' : 'Inactive'}
        </span>
        {assessment.dueDay && <span>Due on day {assessment.dueDay}</span>}
        {assessment.lateFeeAmountCents > 0 && (
          <span>Late fee: {formatCents(assessment.lateFeeAmountCents)} after {assessment.lateFeeDaysGrace}d</span>
        )}
      </div>
    </button>
  );
}

/* ─────── Line Items Panel ─────── */

function LineItemsPanel({
  communityId,
  assessment,
  onClose,
}: {
  communityId: number;
  assessment: Assessment;
  onClose: () => void;
}) {
  const { data: lineItems, isLoading } = useQuery({
    queryKey: ['line-items', communityId, assessment.id],
    queryFn: () => fetchLineItems(communityId, assessment.id),
    staleTime: 30_000,
  });

  const statusCounts = lineItems?.reduce(
    (acc, li) => {
      acc[li.status] = (acc[li.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  ) ?? {};

  return (
    <div className="rounded-md border border-edge bg-surface-card">
      <div className="flex items-center justify-between border-b border-edge px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-content">{assessment.title} — Line Items</h3>
          {lineItems && (
            <div className="mt-1 flex gap-2">
              {Object.entries(statusCounts).map(([status, count]) => (
                <span
                  key={status}
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] || 'bg-surface-muted text-content-secondary'}`}
                >
                  {count} {status}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-content-disabled hover:bg-surface-muted hover:text-content-secondary"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="animate-pulse space-y-2">
            <div className="h-8 rounded bg-surface-muted" />
            <div className="h-8 rounded bg-surface-muted" />
            <div className="h-8 rounded bg-surface-muted" />
          </div>
        ) : lineItems && lineItems.length === 0 ? (
          <p className="py-4 text-center text-sm text-content-tertiary">
            No line items generated yet. Line items are created automatically on the 1st of each month,
            or when manually triggered.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-edge">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-content-tertiary">Unit</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-content-tertiary">Due Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-content-tertiary">Status</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-content-tertiary">Amount</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-content-tertiary">Late Fee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge-subtle">
                {lineItems?.map((li) => (
                  <tr key={li.id} className="hover:bg-surface-hover">
                    <td className="whitespace-nowrap px-3 py-2 text-sm text-content">Unit #{li.unitId}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-sm text-content-secondary">{formatDate(li.dueDate)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[li.status] || ''}`}>
                        {li.status.charAt(0).toUpperCase() + li.status.slice(1)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-sm text-content">{formatCents(li.amountCents)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-sm text-content-tertiary">
                      {li.lateFeeCents > 0 ? formatCents(li.lateFeeCents) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────── Create Assessment Dialog ─────── */

function CreateAssessmentDialog({
  communityId,
  onClose,
  onCreated,
}: {
  communityId: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    amountDollars: '',
    frequency: 'monthly',
    dueDay: '1',
    lateFeeDollars: '',
    lateFeeDaysGrace: '15',
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      createAssessment(communityId, {
        title: formData.title,
        description: formData.description,
        amountCents: Math.round(parseFloat(formData.amountDollars) * 100),
        frequency: formData.frequency,
        dueDay: formData.dueDay ? parseInt(formData.dueDay, 10) : null,
        lateFeeAmountCents: formData.lateFeeDollars
          ? Math.round(parseFloat(formData.lateFeeDollars) * 100)
          : 0,
        lateFeeDaysGrace: parseInt(formData.lateFeeDaysGrace, 10) || 0,
      }),
    onSuccess: () => onCreated(),
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to create assessment');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.title.trim()) {
      setError('Title is required');
      return;
    }
    const amount = parseFloat(formData.amountDollars);
    if (isNaN(amount) || amount <= 0) {
      setError('Amount must be a positive number');
      return;
    }

    mutation.mutate();
  };

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-surface-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-edge px-6 py-4">
          <h2 className="text-lg font-semibold text-content">Create Assessment</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-content-disabled hover:bg-surface-muted hover:text-content-secondary"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-4">
          <div>
            <label className="block text-sm font-medium text-content-secondary">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => updateField('title', e.target.value)}
              placeholder="Monthly Maintenance Assessment"
              className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-content-secondary">Description (optional)</label>
            <textarea
              value={formData.description}
              onChange={(e) => updateField('description', e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-content-secondary">Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={formData.amountDollars}
                onChange={(e) => updateField('amountDollars', e.target.value)}
                placeholder="350.00"
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-content-secondary">Frequency</label>
              <select
                value={formData.frequency}
                onChange={(e) => updateField('frequency', e.target.value)}
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
                <option value="one_time">One-Time</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-content-secondary">Due Day</label>
              <input
                type="number"
                min="1"
                max="31"
                value={formData.dueDay}
                onChange={(e) => updateField('dueDay', e.target.value)}
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-content-secondary">Late Fee ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.lateFeeDollars}
                onChange={(e) => updateField('lateFeeDollars', e.target.value)}
                placeholder="25.00"
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-content-secondary">Grace Days</label>
              <input
                type="number"
                min="0"
                value={formData.lateFeeDaysGrace}
                onChange={(e) => updateField('lateFeeDaysGrace', e.target.value)}
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
              />
            </div>
          </div>

          {error && <p className="text-sm text-status-danger">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md border border-edge-strong bg-surface-card px-4 py-2.5 text-sm font-medium text-content-secondary hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-content-inverse hover:bg-indigo-700 disabled:opacity-50"
            >
              {mutation.isPending ? 'Creating...' : 'Create Assessment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
