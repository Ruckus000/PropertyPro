'use client';

/**
 * The contract form, shared by New and Edit. It writes through the existing
 * `POST` / `PATCH /api/v1/contracts`, then opens the contract's own page.
 * Save is the one button here; Cancel is in the page header.
 *
 * The amount and date checks here are the server's (`contract-rules.ts`), in
 * the same words, so a value this form accepts is one the API accepts.
 *
 * "Bidding closes at" is a wall-clock time in the COMMUNITY's time zone, not
 * the browser's: it is converted with the zoned helpers in both directions,
 * and a time the manager did not touch is sent back exactly as it was stored.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateContract, useUpdateContract, type CreateContractInput } from '@/hooks/use-contracts';
import {
  CONTRACT_END_BEFORE_START_MESSAGE,
  CONTRACT_STATUS,
  CONTRACT_STATUSES,
  contractAmountError,
  isEndBeforeStart,
  type ContractStatus,
} from '@/lib/contracts/contract-rules';
import { utcDateToWallClockValue, wallClockValueToUtcIso } from '@/lib/utils/zoned-datetime';
import { timeZoneLabel } from '@/components/emergency/broadcast-status';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

/** The stored contract an Edit form starts from. */
export interface ContractFormValues {
  id: number;
  title: string;
  vendorName: string;
  description: string | null;
  contractValue: string | null;
  startDate: string;
  endDate: string | null;
  /** ISO time. */
  biddingClosesAt: string | null;
  conflictOfInterest: boolean;
  conflictOfInterestNote: string | null;
  status: string;
  documentId: number | null;
  complianceChecklistItemId: number | null;
}

interface ContractFormProps {
  communityId: number;
  /** The community's IANA time zone: "Bidding closes at" is read and written in it. */
  timeZone: string;
  /** Absent on the New page. */
  contract?: ContractFormValues;
}

/** A stored ISO time as the `datetime-local` value it is in `timeZone`. */
export function closingTimeToInput(iso: string | null, timeZone: string): string {
  return iso ? utcDateToWallClockValue(new Date(iso), timeZone) : '';
}

/**
 * The `datetime-local` value back as ISO. An untouched field returns the stored
 * time exactly (the input drops seconds, and re-deriving would move it).
 */
export function closingTimeFromInput(value: string, timeZone: string, stored: string | null): string | null {
  if (value === '') return null;
  if (stored && value === closingTimeToInput(stored, timeZone)) return stored;
  return wallClockValueToUtcIso(value, timeZone);
}

const HINT = 'text-sm text-content-secondary';
const ERROR = 'text-sm text-status-danger';

function isStatus(value: string): value is ContractStatus {
  return (CONTRACT_STATUSES as readonly string[]).includes(value);
}

export function ContractForm({ communityId, timeZone, contract }: ContractFormProps) {
  const router = useRouter();
  const isEdit = contract !== undefined;
  const storedClosesAt = contract?.biddingClosesAt ?? null;

  const [title, setTitle] = useState(contract?.title ?? '');
  const [vendorName, setVendorName] = useState(contract?.vendorName ?? '');
  const [description, setDescription] = useState(contract?.description ?? '');
  const [contractValue, setContractValue] = useState(contract?.contractValue ?? '');
  const [startDate, setStartDate] = useState(contract?.startDate ?? '');
  const [endDate, setEndDate] = useState(contract?.endDate ?? '');
  const [status, setStatus] = useState<ContractStatus>(
    contract && isStatus(contract.status) ? contract.status : 'active',
  );
  const [biddingClosesAt, setBiddingClosesAt] = useState(closingTimeToInput(storedClosesAt, timeZone));
  const [conflictOfInterest, setConflictOfInterest] = useState(contract?.conflictOfInterest ?? false);
  const [conflictNote, setConflictNote] = useState(contract?.conflictOfInterestNote ?? '');
  const [documentId, setDocumentId] = useState(contract?.documentId != null ? String(contract.documentId) : '');
  const [checklistItemId, setChecklistItemId] = useState(
    contract?.complianceChecklistItemId != null ? String(contract.complianceChecklistItemId) : '',
  );
  const [valueError, setValueError] = useState<string | null>(null);
  const [endError, setEndError] = useState<string | null>(null);

  const createMutation = useCreateContract(communityId);
  const updateMutation = useUpdateContract(communityId);
  const active = isEdit ? updateMutation : createMutation;
  const saving = active.isPending;
  const saveError = active.error instanceof Error ? active.error.message : null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const value = contractValue.trim();
    const valueProblem = contractAmountError(value);
    const endProblem = isEndBeforeStart(startDate, endDate) ? CONTRACT_END_BEFORE_START_MESSAGE : null;
    setValueError(valueProblem);
    setEndError(endProblem);
    if (valueProblem || endProblem) return;

    const payload: CreateContractInput = {
      title: title.trim(),
      vendorName: vendorName.trim(),
      description: description.trim() || null,
      contractValue: value || null,
      startDate,
      endDate: endDate || null,
      status,
      biddingClosesAt: closingTimeFromInput(biddingClosesAt, timeZone, storedClosesAt),
      conflictOfInterest,
      // The note belongs to a declared conflict; unticking the box clears it.
      conflictOfInterestNote: conflictOfInterest ? conflictNote.trim() || null : null,
      documentId: documentId !== '' ? Number(documentId) : null,
      complianceChecklistItemId: checklistItemId !== '' ? Number(checklistItemId) : null,
    };

    let savedId: number;
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: contract.id, ...payload });
        savedId = contract.id;
      } else {
        savedId = (await createMutation.mutateAsync(payload)).id;
      }
    } catch {
      return; // shown through `saveError`; the form stays open
    }
    router.push(`/contracts/${savedId}?communityId=${communityId}`);
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-5 p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contract-title">
            Title <span aria-hidden="true">*</span>
          </Label>
          <Input
            id="contract-title"
            required
            maxLength={500}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="vendor-name">
            Vendor name <span aria-hidden="true">*</span>
          </Label>
          <Input
            id="vendor-name"
            required
            maxLength={500}
            value={vendorName}
            onChange={(event) => setVendorName(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="contract-description">Description</Label>
        <Textarea
          id="contract-description"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contract-value">Contract value ($)</Label>
          <Input
            id="contract-value"
            inputMode="decimal"
            placeholder="0.00"
            value={contractValue}
            onChange={(event) => setContractValue(event.target.value)}
            aria-invalid={valueError ? true : undefined}
            aria-describedby={valueError ? 'contract-value-error' : undefined}
          />
          {valueError ? (
            <p id="contract-value-error" role="alert" className={ERROR}>
              {valueError}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="contract-status">Status</Label>
          <Select value={status} onValueChange={(next) => setStatus(next as ContractStatus)}>
            <SelectTrigger id="contract-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTRACT_STATUSES.map((option) => (
                <SelectItem key={option} value={option}>
                  {CONTRACT_STATUS[option].word}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className={HINT}>Use Terminated to retire a contract; contracts are not deleted.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="start-date">
            Start date <span aria-hidden="true">*</span>
          </Label>
          <Input
            id="start-date"
            type="date"
            required
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="end-date">End date</Label>
          <Input
            id="end-date"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            aria-invalid={endError ? true : undefined}
            aria-describedby={endError ? 'end-date-error' : undefined}
          />
          {endError ? (
            <p id="end-date-error" role="alert" className={ERROR}>
              {endError}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2 sm:max-w-sm">
        <Label htmlFor="bidding-closes">Bidding closes at</Label>
        <Input
          id="bidding-closes"
          type="datetime-local"
          value={biddingClosesAt}
          onChange={(event) => setBiddingClosesAt(event.target.value)}
          aria-describedby="bidding-closes-hint"
        />
        <p id="bidding-closes-hint" className={HINT}>
          Bids stay sealed until this time. Time zone: {timeZoneLabel(timeZone)}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="document-id">Linked Document ID</Label>
          {/* ponytail: the linked document is typed in as a number; there is no document picker in the app to reuse, and the contract's page shows the document's title with a link. Trigger: a manager asks how to find a document's number. */}
          <Input
            id="document-id"
            type="number"
            min="1"
            step="1"
            value={documentId}
            onChange={(event) => setDocumentId(event.target.value)}
            aria-describedby="document-id-hint"
          />
          <p id="document-id-hint" className={HINT}>
            The number of a document already uploaded to Documents.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="compliance-checklist-item-id">Compliance Checklist Item ID</Label>
          <Input
            id="compliance-checklist-item-id"
            type="number"
            min="1"
            step="1"
            value={checklistItemId}
            onChange={(event) => setChecklistItemId(event.target.value)}
            aria-describedby="compliance-checklist-item-id-hint"
          />
          <p id="compliance-checklist-item-id-hint" className={HINT}>
            The number of the compliance item this contract satisfies.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex min-h-11 items-center gap-2 md:min-h-0">
          <Checkbox
            id="conflict-of-interest"
            checked={conflictOfInterest}
            onCheckedChange={(checked) => setConflictOfInterest(checked === true)}
          />
          <Label htmlFor="conflict-of-interest">Conflict of interest declared</Label>
        </div>
        {conflictOfInterest ? (
          <div className="space-y-2">
            <Label htmlFor="conflict-note">Conflict of interest note</Label>
            <Textarea
              id="conflict-note"
              rows={2}
              value={conflictNote}
              onChange={(event) => setConflictNote(event.target.value)}
              aria-describedby="conflict-note-hint"
            />
            <p id="conflict-note-hint" className={HINT}>
              Who has the interest and what it is. Managers see this on the contract&apos;s page.
            </p>
          </div>
        ) : null}
      </div>

      {saveError ? (
        <p role="alert" className={ERROR}>
          {saveError}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 border-t border-edge pt-4">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save contract'}
        </Button>
      </div>
    </form>
  );
}
