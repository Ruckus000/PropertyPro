'use client';

import { useState, type FormEvent } from 'react';
import { SlideOverPanel } from '@/components/shared/slide-over-panel';
import { useCreateWorkOrder, useVendors } from '@/hooks/use-operations';

interface WorkOrderCreateSheetProps {
  open: boolean;
  onClose: () => void;
  communityId: number;
}

const PRIORITIES: ReadonlyArray<'low' | 'medium' | 'high' | 'urgent'> = ['low', 'medium', 'high', 'urgent'];

export function WorkOrderCreateSheet({ open, onClose, communityId }: WorkOrderCreateSheetProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [unitId, setUnitId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [slaResponseHours, setSlaResponseHours] = useState('');
  const [slaCompletionHours, setSlaCompletionHours] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const vendorsQuery = useVendors(communityId);
  const createMutation = useCreateWorkOrder(communityId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    try {
      await createMutation.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        priority,
        unitId: unitId ? Number(unitId) : null,
        vendorId: vendorId ? Number(vendorId) : null,
        slaResponseHours: slaResponseHours ? Number(slaResponseHours) : null,
        slaCompletionHours: slaCompletionHours ? Number(slaCompletionHours) : null,
        notes: notes.trim() || null,
      });
      setTitle(''); setDescription(''); setPriority('medium'); setUnitId('');
      setVendorId(''); setSlaResponseHours(''); setSlaCompletionHours(''); setNotes('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create work order');
    }
  }

  return (
    <SlideOverPanel
      open={open}
      onClose={onClose}
      title="Dispatch Work Order"
      description="Assign maintenance work to a vendor."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="wo-title" className="block text-sm font-medium text-content-secondary">Title</label>
          <input
            id="wo-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={240}
            className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="wo-description" className="block text-sm font-medium text-content-secondary">Description</label>
          <textarea
            id="wo-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={5000}
            rows={3}
            className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="wo-priority" className="block text-sm font-medium text-content-secondary">Priority</label>
            <select
              id="wo-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
              className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
            >
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="wo-vendor" className="block text-sm font-medium text-content-secondary">Vendor</label>
            <select
              id="wo-vendor"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
            >
              <option value="">(Assign later)</option>
              {vendorsQuery.data?.filter((v) => v.isActive).map((v) => (
                <option key={v.id} value={String(v.id)}>{v.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="wo-unit" className="block text-sm font-medium text-content-secondary">Unit ID</label>
            <input
              id="wo-unit"
              type="number"
              min={1}
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="wo-sla-response" className="block text-sm font-medium text-content-secondary">SLA Response (hrs)</label>
            <input
              id="wo-sla-response"
              type="number"
              min={1}
              value={slaResponseHours}
              onChange={(e) => setSlaResponseHours(e.target.value)}
              className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label htmlFor="wo-sla-completion" className="block text-sm font-medium text-content-secondary">SLA Completion (hrs)</label>
          <input
            id="wo-sla-completion"
            type="number"
            min={1}
            value={slaCompletionHours}
            onChange={(e) => setSlaCompletionHours(e.target.value)}
            className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="wo-notes" className="block text-sm font-medium text-content-secondary">Notes</label>
          <textarea
            id="wo-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
          />
        </div>
        {error ? (
          <p className="rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="w-full rounded-md bg-interactive px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {createMutation.isPending ? 'Dispatching…' : 'Dispatch Work Order'}
        </button>
      </form>
    </SlideOverPanel>
  );
}
