'use client';

/**
 * Schedule a move-out on the current lease.
 *
 * `notice`: the resident gave notice to vacate. For a month-to-month tenancy
 * the page warns (does not block) when the notice is under 30 days (§83.57).
 * `early`: the lease ends before its term, with a required reason.
 * Both are reversible: the undo clears the move-out.
 */
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { depositDispositionDeadlines, monthToMonthNoticeShort } from '@/lib/leases/lease-state';
import { addDays } from '@/lib/leases/roster-model';
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
  isIsoDate,
  namesOf,
  openDeposit,
  useSubmitAttempt,
  type Errors,
  type ServerErrorView,
} from './form-kit';

const EARLY_REASONS_FIXED = [
  'Mutual agreement',
  'Resident request',
  'Buyout',
  'Lease violation',
  'Casualty damage (§83.63)',
  'Other',
] as const;
const EARLY_REASONS_M2M = [
  'Landlord gave notice',
  'Mutual agreement',
  'Lease violation',
  'Casualty damage (§83.63)',
  'Other',
] as const;

export type MoveOutDialogProps = RosterDialogProps & { mode: 'notice' | 'early' };

export function MoveOutDialog(props: MoveOutDialogProps) {
  const { model, mode, today, actions, onDone, onClose } = props;
  const lease = model?.current ?? null;
  const isM2M = !lease?.endDate;
  const holdover = !!lease?.endDate && lease.endDate < today;

  const [noticeOn, setNoticeOn] = useState(today);
  const [moveOutOn, setMoveOutOn] = useState(mode === 'notice' && lease?.endDate && !holdover ? lease.endDate : '');
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [serverError, setServerError] = useState<ServerErrorView | null>(null);
  const { tried, guard } = useSubmitAttempt();

  if (!model || !lease) {
    return (
      <RosterDialogFrame
        title="Record move-out"
        description="This unit has no current lease."
        onClose={onClose}
        pending={false}
        cancelLabel="Close"
      >
        <p className="text-sm text-content-secondary">There is nothing to end.</p>
      </RosterDialogFrame>
    );
  }

  const unit = `Unit ${model.unit.unitNumber}`;
  const validMove = isIsoDate(moveOutOn);
  const errors: Errors =
    mode === 'notice'
      ? {
          noticeOn: !isIsoDate(noticeOn)
            ? 'Enter the date the notice was received.'
            : noticeOn > today
              ? 'Must be today or earlier. Record the notice once it is received.'
              : null,
          moveOut: !validMove
            ? 'Enter the move-out date.'
            : moveOutOn < lease.startDate
              ? `Must be on or after the lease start, ${fmtDate(lease.startDate)}.`
              : lease.endDate && !holdover && moveOutOn > lease.endDate
                ? `This is after the lease ends, ${fmtDate(lease.endDate)}. Record a renewal or month-to-month instead.`
                : null,
        }
      : {
          reason: reason ? null : 'Choose a reason. It is saved with the lease record.',
          moveOut: !validMove
            ? 'Enter the last day of the lease.'
            : moveOutOn < lease.startDate
              ? `Must be on or after the lease start, ${fmtDate(lease.startDate)}.`
              : lease.endDate && moveOutOn > lease.endDate
                ? `An early end must be on or before the lease end, ${fmtDate(lease.endDate)}.`
                : null,
          details: reason === 'Other' && !details.trim() ? 'Describe the reason for ending the lease.' : null,
        };
  const ids = { noticeOn: 'mo-notice-on', moveOut: 'mo-move-out', reason: 'mo-reason-0', details: 'mo-details' };

  const shortNotice =
    mode === 'notice' && isM2M && isIsoDate(noticeOn) && validMove && monthToMonthNoticeShort(noticeOn, moveOutOn);
  const deadlines = validMove ? depositDispositionDeadlines(moveOutOn) : null;
  const deposit = openDeposit(lease);
  const pending = actions.updateLease.isPending;

  async function submit() {
    if (!guard(errors, ids) || !lease) return;
    setServerError(null);
    const endReason = mode === 'early' ? (reason === 'Other' ? `Other: ${details.trim()}` : reason) : null;
    try {
      await actions.updateLease.mutateAsync({
        id: lease.id,
        version: lease.version,
        moveOutOn,
        endVia: mode,
        endReason: endReason ?? (details.trim() || null),
        noticeReceivedOn: mode === 'notice' ? noticeOn : null,
      });
      const id = lease.id;
      onDone(
        mode === 'early'
          ? `${unit} ends early on ${fmtDate(moveOutOn)}. You can undo this until then.`
          : `${unit} moving out ${fmtDate(moveOutOn)}.`,
        () => actions.updateLease.mutateAsync({ id, moveOutOn: null }),
      );
    } catch (err) {
      setServerError(describeError(err));
    }
  }

  const title =
    mode === 'early'
      ? `${isM2M ? 'End month-to-month tenancy' : 'End lease early'} · ${unit}`
      : `Record notice to vacate · ${unit}`;
  const description = `${namesOf(model.people)}. ${
    isM2M
      ? `Month-to-month since ${fmtDate(lease.startDate)}.`
      : holdover
        ? `The lease ended ${fmtDate(lease.endDate)}.`
        : `The lease ends ${fmtDate(lease.endDate)}.`
  }`;
  const reasons = isM2M ? EARLY_REASONS_M2M : EARLY_REASONS_FIXED;

  return (
    <RosterDialogFrame
      title={title}
      description={description}
      onClose={onClose}
      onSubmit={() => void submit()}
      submitLabel={mode === 'early' ? (isM2M ? 'End tenancy' : 'End lease early') : 'Record move-out'}
      submitVariant={mode === 'early' ? 'destructive' : 'default'}
      pending={pending}
    >
      <ServerErrorBanner error={serverError} />

      {mode === 'early' ? (
        <RadioGroupField
          name="mo-reason"
          legend="Why is the lease ending?"
          options={reasons.map((r) => ({ value: r, label: r }))}
          value={reason}
          onChange={setReason}
          error={errors.reason}
          show={tried}
        />
      ) : (
        <Field
          id="mo-notice-on"
          label="Notice received on"
          hint={isM2M ? 'Notice for a month-to-month tenancy is counted from this date (§83.57).' : undefined}
          error={errors.noticeOn}
          show={tried}
        >
          <Input
            {...fieldA11y('mo-notice-on', errors.noticeOn, tried, isM2M)}
            type="date"
            max={today}
            value={noticeOn}
            onChange={(e) => setNoticeOn(e.target.value)}
          />
        </Field>
      )}

      <Field
        id="mo-move-out"
        label={mode === 'early' ? 'Last day' : 'Move-out date'}
        hint={
          validMove
            ? moveOutOn < today
              ? `In the past. The lease closes now and the unit shows as vacant from ${fmtDate(addDays(moveOutOn, 1))}.`
              : `The unit is available to lease from ${fmtDate(addDays(moveOutOn, 1))}.`
            : mode === 'notice' && lease.endDate && !holdover
              ? 'Defaults to the lease end date.'
              : 'The resident’s last day in the unit.'
        }
        error={errors.moveOut}
        show={tried}
      >
        <Input
          {...fieldA11y('mo-move-out', errors.moveOut, tried, true)}
          type="date"
          min={lease.startDate}
          max={lease.endDate && (mode === 'early' || !holdover) ? lease.endDate : undefined}
          value={moveOutOn}
          onChange={(e) => setMoveOutOn(e.target.value)}
        />
      </Field>

      {shortNotice ? (
        <Note tone="warning">
          This gives less than 30 days’ notice. Florida requires at least 30 days’ written notice before the end of a
          monthly period for a month-to-month tenancy (§83.57). You can still record it if the shorter date was
          agreed.
        </Note>
      ) : null}

      {deadlines ? (
        <Note>
          {deposit ? 'Deposit deadlines after move-out: ' : 'If a deposit is held: '}
          refund in full by {fmtDate(deadlines.refundBy)}, or send a written claim by {fmtDate(deadlines.claimBy)}{' '}
          (§83.49(3)).
        </Note>
      ) : null}

      <Field
        id="mo-details"
        label={mode === 'early' ? 'Details' : 'Notes'}
        optional={!(mode === 'early' && reason === 'Other')}
        error={errors.details}
        show={tried}
      >
        <Textarea
          {...fieldA11y('mo-details', errors.details, tried)}
          rows={3}
          placeholder={mode === 'early' ? 'Details for the lease record' : 'Forwarding address, key return…'}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
      </Field>
    </RosterDialogFrame>
  );
}
