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
 *
 * Edit sends only the fields that differ from the loaded contract, and sends
 * nothing when none do.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateContract, useUpdateContract, type CreateContractInput } from '@/hooks/use-contracts';
import {
  CONTRACT_CLOSING_TIME_MESSAGE,
  CONTRACT_END_BEFORE_START_MESSAGE,
  CONTRACT_STATUS,
  CONTRACT_TITLE_REQUIRED_MESSAGE,
  CONTRACT_VENDOR_REQUIRED_MESSAGE,
  CONTRACT_STATUSES,
  contractAmountError,
  isEndBeforeStart,
  type ContractStatus,
} from '@/lib/contracts/contract-rules';
import { CLOSING_TIME_LOCKED_MESSAGE, isClosingTimeChangeAllowed } from '@/lib/contracts/bid-sealing';
import { resolveTimezone } from '@/lib/utils/timezone';
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
  /**
   * The contract is sealed and has bids: the closing time can be moved later,
   * not cleared or brought forward. The server enforces it; this says so first.
   */
  closingTimeLocked?: boolean;
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

/** The form's fields as typed. */
interface FormFields {
  title: string;
  vendorName: string;
  description: string;
  contractValue: string;
  startDate: string;
  endDate: string;
  /** Null: the stored status is not one of the four, and has not been changed. */
  status: ContractStatus | null;
  /** `datetime-local` text in the community's time zone. */
  biddingClosesAt: string;
  conflictOfInterest: boolean;
  conflictNote: string;
  documentId: string;
  checklistItemId: string;
}

function fieldsFromContract(contract: ContractFormValues | undefined, timeZone: string): FormFields {
  return {
    title: contract?.title ?? '',
    vendorName: contract?.vendorName ?? '',
    description: contract?.description ?? '',
    contractValue: contract?.contractValue ?? '',
    startDate: contract?.startDate ?? '',
    endDate: contract?.endDate ?? '',
    // A new contract starts Active. A stored status this form does not know is
    // left alone: never rewritten to Active just because the form was saved.
    status: contract ? (isStatus(contract.status) ? contract.status : null) : 'active',
    biddingClosesAt: closingTimeToInput(contract?.biddingClosesAt ?? null, timeZone),
    conflictOfInterest: contract?.conflictOfInterest ?? false,
    conflictNote: contract?.conflictOfInterestNote ?? '',
    documentId: contract?.documentId != null ? String(contract.documentId) : '',
    checklistItemId:
      contract?.complianceChecklistItemId != null ? String(contract.complianceChecklistItemId) : '',
  };
}

/** The fields as the API takes them. Throws when the closing time cannot be read. */
function toPayload(fields: FormFields, timeZone: string, storedClosesAt: string | null): CreateContractInput {
  return {
    title: fields.title.trim(),
    vendorName: fields.vendorName.trim(),
    description: fields.description.trim() || null,
    contractValue: fields.contractValue.trim() || null,
    startDate: fields.startDate,
    endDate: fields.endDate || null,
    ...(fields.status ? { status: fields.status } : {}),
    biddingClosesAt: closingTimeFromInput(fields.biddingClosesAt, timeZone, storedClosesAt),
    conflictOfInterest: fields.conflictOfInterest,
    // The note belongs to a declared conflict; unticking the box clears it.
    conflictOfInterestNote: fields.conflictOfInterest ? fields.conflictNote.trim() || null : null,
    documentId: fields.documentId !== '' ? Number(fields.documentId) : null,
    complianceChecklistItemId: fields.checklistItemId !== '' ? Number(fields.checklistItemId) : null,
  };
}

/**
 * The fields of `next` that differ from `loaded`. An edit sends only these, so
 * the audit entry for a save lists what the manager changed and nothing else:
 * a new bidding-close time stands alone, not among twelve unchanged fields.
 */
export function changedFields(
  next: CreateContractInput,
  loaded: CreateContractInput,
): Partial<CreateContractInput> {
  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(next) as Array<keyof CreateContractInput>) {
    if (next[key] !== loaded[key]) changes[key] = next[key];
  }
  return changes as Partial<CreateContractInput>;
}

export function ContractForm({
  communityId,
  timeZone: storedTimeZone,
  contract,
  closingTimeLocked = false,
}: ContractFormProps) {
  const router = useRouter();
  const isEdit = contract !== undefined;
  // A stored zone `Intl` does not know must not crash the page.
  const timeZone = resolveTimezone(storedTimeZone);
  const storedClosesAt = contract?.biddingClosesAt ?? null;
  // The contract as it was loaded: what an edit is compared against.
  const [loaded] = useState(() => fieldsFromContract(contract, timeZone));

  const [title, setTitle] = useState(loaded.title);
  const [vendorName, setVendorName] = useState(loaded.vendorName);
  const [description, setDescription] = useState(loaded.description);
  const [contractValue, setContractValue] = useState(loaded.contractValue);
  const [startDate, setStartDate] = useState(loaded.startDate);
  const [endDate, setEndDate] = useState(loaded.endDate);
  const [status, setStatus] = useState<ContractStatus | null>(loaded.status);
  const [biddingClosesAt, setBiddingClosesAt] = useState(loaded.biddingClosesAt);
  const [conflictOfInterest, setConflictOfInterest] = useState(loaded.conflictOfInterest);
  const [conflictNote, setConflictNote] = useState(loaded.conflictNote);
  const [documentId, setDocumentId] = useState(loaded.documentId);
  const [checklistItemId, setChecklistItemId] = useState(loaded.checklistItemId);
  const [errors, setErrors] = useState<{
    title?: string;
    vendorName?: string;
    value?: string;
    end?: string;
    closes?: string;
  }>({});

  const createMutation = useCreateContract(communityId);
  const updateMutation = useUpdateContract(communityId);
  const active = isEdit ? updateMutation : createMutation;
  const saving = active.isPending;
  const saveError = active.error instanceof Error ? active.error.message : null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const fields: FormFields = {
      title,
      vendorName,
      description,
      contractValue,
      startDate,
      endDate,
      status,
      biddingClosesAt,
      conflictOfInterest,
      conflictNote,
      documentId,
      checklistItemId,
    };

    const problems: typeof errors = {};
    // `required` lets a name made only of spaces through; the server would refuse it.
    if (title.trim() === '') problems.title = CONTRACT_TITLE_REQUIRED_MESSAGE;
    if (vendorName.trim() === '') problems.vendorName = CONTRACT_VENDOR_REQUIRED_MESSAGE;
    const valueProblem = contractAmountError(contractValue.trim());
    if (valueProblem) problems.value = valueProblem;
    if (isEndBeforeStart(startDate, endDate)) problems.end = CONTRACT_END_BEFORE_START_MESSAGE;

    let payload: CreateContractInput | null = null;
    let changes: Partial<CreateContractInput> = {};
    try {
      payload = toPayload(fields, timeZone, storedClosesAt);
      if (isEdit) changes = changedFields(payload, toPayload(loaded, timeZone, storedClosesAt));
    } catch {
      // A date the field accepts but that is not a real wall-clock time (a six-digit year).
      problems.closes = CONTRACT_CLOSING_TIME_MESSAGE;
    }
    if (closingTimeLocked && payload && 'biddingClosesAt' in changes) {
      const next = payload.biddingClosesAt ? new Date(payload.biddingClosesAt) : null;
      const stored = storedClosesAt ? new Date(storedClosesAt) : undefined;
      if (!isClosingTimeChangeAllowed(stored, next, new Date())) problems.closes = CLOSING_TIME_LOCKED_MESSAGE;
    }

    setErrors(problems);
    if (payload === null || Object.keys(problems).length > 0) return;

    let savedId: number;
    try {
      if (isEdit) {
        savedId = contract.id;
        // Nothing changed: nothing to save, and nothing to put in the audit trail.
        if (Object.keys(changes).length > 0) {
          await updateMutation.mutateAsync({ id: contract.id, ...changes });
        }
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
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={errors.title ? 'contract-title-error' : undefined}
          />
          {errors.title ? (
            <p id="contract-title-error" role="alert" className={ERROR}>
              {errors.title}
            </p>
          ) : null}
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
            aria-invalid={errors.vendorName ? true : undefined}
            aria-describedby={errors.vendorName ? 'vendor-name-error' : undefined}
          />
          {errors.vendorName ? (
            <p id="vendor-name-error" role="alert" className={ERROR}>
              {errors.vendorName}
            </p>
          ) : null}
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
            aria-invalid={errors.value ? true : undefined}
            aria-describedby={errors.value ? 'contract-value-error' : undefined}
          />
          {errors.value ? (
            <p id="contract-value-error" role="alert" className={ERROR}>
              {errors.value}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="contract-status">Status</Label>
          <Select value={status ?? ''} onValueChange={(next) => setStatus(next as ContractStatus)}>
            <SelectTrigger id="contract-status" aria-describedby="contract-status-hint">
              {/* An unknown stored status is shown as it is written, until another is chosen. */}
              <SelectValue placeholder={contract?.status} />
            </SelectTrigger>
            <SelectContent>
              {CONTRACT_STATUSES.map((option) => (
                <SelectItem key={option} value={option}>
                  {CONTRACT_STATUS[option].word}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p id="contract-status-hint" className={HINT}>
            {status === null
              ? 'This status is not one of the four. It is kept as it is unless you choose another.'
              : 'Use Terminated to retire a contract; contracts are not deleted.'}
          </p>
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
            aria-invalid={errors.end ? true : undefined}
            aria-describedby={errors.end ? 'end-date-error' : undefined}
          />
          {errors.end ? (
            <p id="end-date-error" role="alert" className={ERROR}>
              {errors.end}
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
          aria-invalid={errors.closes ? true : undefined}
          aria-describedby={errors.closes ? 'bidding-closes-error bidding-closes-hint' : 'bidding-closes-hint'}
        />
        {errors.closes ? (
          <p id="bidding-closes-error" role="alert" className={ERROR}>
            {errors.closes}
          </p>
        ) : null}
        <p id="bidding-closes-hint" className={HINT}>
          {closingTimeLocked ? `${CLOSING_TIME_LOCKED_MESSAGE} ` : 'Bids stay sealed until this time. '}
          Time zone: {timeZoneLabel(timeZone)}.
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
