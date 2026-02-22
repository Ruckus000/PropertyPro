'use client';

/**
 * P3-52: Contract create/edit form.
 *
 * Handles creating new contracts and editing existing ones.
 * Sends POST (create) or PATCH (update) to /api/v1/contracts.
 */
import { useState } from 'react';

interface ContractRecord {
  id: number;
  title: string;
  vendorName: string;
  description: string | null;
  contractValue: string | null;
  startDate: string;
  endDate: string | null;
  biddingClosesAt: string | null;
  conflictOfInterest: boolean;
  documentId: number | null;
  complianceChecklistItemId: number | null;
}

interface ContractFormProps {
  communityId: number;
  contract: ContractRecord | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ContractForm({ communityId, contract, onClose, onSaved }: ContractFormProps) {
  const isEdit = contract !== null;

  const [title, setTitle] = useState(contract?.title ?? '');
  const [vendorName, setVendorName] = useState(contract?.vendorName ?? '');
  const [description, setDescription] = useState(contract?.description ?? '');
  const [contractValue, setContractValue] = useState(contract?.contractValue ?? '');
  const [startDate, setStartDate] = useState(contract?.startDate ?? '');
  const [endDate, setEndDate] = useState(contract?.endDate ?? '');
  const [biddingClosesAt, setBiddingClosesAt] = useState(
    contract?.biddingClosesAt ? contract.biddingClosesAt.slice(0, 16) : '',
  );
  const [conflictOfInterest, setConflictOfInterest] = useState(contract?.conflictOfInterest ?? false);
  const [documentId, setDocumentId] = useState<string>(
    contract?.documentId != null ? String(contract.documentId) : '',
  );
  const [complianceChecklistItemId, setComplianceChecklistItemId] = useState<string>(
    contract?.complianceChecklistItemId != null ? String(contract.complianceChecklistItemId) : '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const parsedDocumentId = documentId !== '' ? Number(documentId) : null;
      const parsedChecklistItemId =
        complianceChecklistItemId !== '' ? Number(complianceChecklistItemId) : null;

      const payload: Record<string, unknown> = {
        communityId,
        title,
        vendorName,
        description: description || null,
        contractValue: contractValue || null,
        startDate,
        endDate: endDate || null,
        biddingClosesAt: biddingClosesAt ? new Date(biddingClosesAt).toISOString() : null,
        conflictOfInterest,
        documentId: parsedDocumentId,
        complianceChecklistItemId: parsedChecklistItemId,
      };

      if (isEdit) {
        payload['id'] = contract.id;
        const res = await fetch('/api/v1/contracts', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errJson = (await res.json()) as { error: { message: string } };
          throw new Error(errJson.error.message);
        }
      } else {
        const res = await fetch('/api/v1/contracts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errJson = (await res.json()) as { error: { message: string } };
          throw new Error(errJson.error.message);
        }
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save contract');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">
          {isEdit ? 'Edit Contract' : 'New Contract'}
        </h2>
        <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">
          Cancel
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="contract-title" className="block text-sm font-medium text-gray-700">
              Title *
            </label>
            <input
              id="contract-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="vendor-name" className="block text-sm font-medium text-gray-700">
              Vendor Name *
            </label>
            <input
              id="vendor-name"
              type="text"
              required
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="contract-value" className="block text-sm font-medium text-gray-700">
              Contract Value ($)
            </label>
            <input
              id="contract-value"
              type="text"
              value={contractValue}
              onChange={(e) => setContractValue(e.target.value)}
              placeholder="0.00"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="start-date" className="block text-sm font-medium text-gray-700">
              Start Date *
            </label>
            <input
              id="start-date"
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="end-date" className="block text-sm font-medium text-gray-700">
              End Date
            </label>
            <input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
        </div>

        <div>
          <label htmlFor="bidding-closes" className="block text-sm font-medium text-gray-700">
            Bidding Closes At
          </label>
          <input
            id="bidding-closes"
            type="datetime-local"
            value={biddingClosesAt}
            onChange={(e) => setBiddingClosesAt(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            Bid details are hidden until this date passes (embargo).
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="document-id" className="block text-sm font-medium text-gray-700">
              Linked Document ID
            </label>
            <input
              id="document-id"
              type="number"
              min="1"
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
              placeholder="Optional document ID"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">Link to an uploaded document by its numeric ID.</p>
          </div>
          <div>
            <label
              htmlFor="compliance-checklist-item-id"
              className="block text-sm font-medium text-gray-700"
            >
              Compliance Checklist Item ID
            </label>
            <input
              id="compliance-checklist-item-id"
              type="number"
              min="1"
              value={complianceChecklistItemId}
              onChange={(e) => setComplianceChecklistItemId(e.target.value)}
              placeholder="Optional checklist item ID"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              Link to a compliance checklist item by its numeric ID.
            </p>
          </div>
        </div>

        <div className="flex items-center">
          <input
            id="conflict-of-interest"
            type="checkbox"
            checked={conflictOfInterest}
            onChange={(e) => setConflictOfInterest(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="conflict-of-interest" className="ml-2 block text-sm text-gray-700">
            Conflict of interest declared
          </label>
        </div>

        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}
