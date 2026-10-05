'use client';

/**
 * Cancel an upcoming lease (one that has not started). The record is kept in
 * Lease history as Cancelled; only "Entered by mistake" deletes it. The server
 * refuses either while rent charges are unpaid (decisions D9).
 */
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { addDays, peopleOn } from '@/lib/leases/roster-model';
import type { RosterDialogProps } from '../types';
import {
  Field,
  Note,
  RadioGroupField,
  RosterDialogFrame,
  ServerErrorBanner,
  describeError,
  fieldA11y,
  fmtDate,
  formatMoney,
  namesOf,
  openDeposit,
  useSubmitAttempt,
  type Errors,
  type ServerErrorView,
} from './form-kit';

export const CANCEL_REASONS = [
  'Applicant withdrew',
  'Failed screening',
  'Unit not ready',
  'Entered by mistake',
  'Other',
] as const;
type CancelReason = (typeof CANCEL_REASONS)[number];

export function CancelLeaseDialog(props: RosterDialogProps) {
  const { model, lease: leaseProp, today, actions, directory, onDone, onClose } = props;
  const lease = leaseProp ?? model?.next ?? null;

  const [reason, setReason] = useState<CancelReason | null>(null);
  const [other, setOther] = useState('');
  const [serverError, setServerError] = useState<ServerErrorView | null>(null);
  const { tried, guard } = useSubmitAttempt();

  if (!model || !lease) {
    return (
      <RosterDialogFrame
        title="Cancel upcoming lease"
        description="There is no upcoming lease on this unit."
        onClose={onClose}
        pending={false}
        cancelLabel="Close"
      >
        <p className="text-sm text-content-secondary">Nothing to cancel.</p>
      </RosterDialogFrame>
    );
  }

  const unit = `Unit ${model.unit.unitNumber}`;
  const mistake = reason === 'Entered by mistake';
  const deposit = openDeposit(lease);
  const hasDeposit = !!deposit && Number(deposit.amount) > 0;
  const errors: Errors = {
    reason: reason ? null : 'Choose a reason. It is saved with the lease record.',
    other: reason === 'Other' && !other.trim() ? 'Describe why the lease was cancelled.' : null,
  };
  const pending = actions.updateLease.isPending || actions.deleteLease.isPending;

  async function submit() {
    if (!guard(errors, { reason: 'cl-reason-0', other: 'cl-other' }) || !lease) return;
    setServerError(null);
    try {
      if (mistake) {
        await actions.deleteLease.mutateAsync({ id: String(lease.id) });
        onDone(`Upcoming lease for ${unit} deleted.`);
      } else {
        await actions.updateLease.mutateAsync({
          id: lease.id,
          version: lease.version,
          status: 'cancelled',
          cancelledReason: reason === 'Other' ? `Other: ${other.trim()}` : (reason as string),
        });
        onDone(`Upcoming lease for ${unit} cancelled. It is kept in Lease history.`);
      }
    } catch (err) {
      setServerError(describeError(err));
    }
  }

  return (
    <RosterDialogFrame
      title={`Cancel upcoming lease · ${unit}`}
      description={`${namesOf(peopleOn(lease, directory))}. Was to start ${fmtDate(lease.startDate)}.`}
      onClose={onClose}
      onSubmit={() => void submit()}
      submitLabel={mistake ? 'Delete lease' : 'Cancel lease'}
      submitVariant="destructive"
      cancelLabel="Keep lease"
      pending={pending}
    >
      <ServerErrorBanner error={serverError} />
      <RadioGroupField<CancelReason>
        name="cl-reason"
        legend="Why is it cancelled?"
        options={CANCEL_REASONS.map((r) => ({ value: r, label: r }))}
        value={reason}
        onChange={setReason}
        error={errors.reason}
        show={tried}
      />
      {reason === 'Other' ? (
        <Field id="cl-other" label="Reason" error={errors.other} show={tried}>
          <Input {...fieldA11y('cl-other', errors.other, tried)} value={other} onChange={(e) => setOther(e.target.value)} />
        </Field>
      ) : null}
      {hasDeposit && deposit ? (
        <Note>
          A {formatMoney(deposit.amount)} deposit was collected. Refund it in full by {fmtDate(addDays(today, 15))}, or
          send a written claim within 30 days (§83.49(3)). Record the refund or claim on the deposit.
        </Note>
      ) : null}
      <Note tone={mistake ? 'warning' : 'neutral'}>
        {mistake
          ? 'The lease record is deleted. Use this only if the lease was never signed and no deposit was collected.'
          : `The lease is kept in Lease history as Cancelled. ${unit} becomes available to lease again.`}
      </Note>
    </RosterDialogFrame>
  );
}
