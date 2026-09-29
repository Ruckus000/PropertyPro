'use client';

/**
 * The §83.49 deposit record for one lease: list the deposits, record one
 * (including deposits taken before PropertyPro, with the date the notice went
 * out on paper), record the notice / how the latest one is held, and after
 * move-out record the refund or the claim.
 */
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { depositDispositionDeadlines, depositNoticeDue, depositNoticeLate } from '@/lib/leases/lease-state';
import type { RosterLease } from '@/lib/leases/roster-model';
import type { RosterDialogProps } from '../types';
import {
  Field,
  HELD_OPTIONS,
  NativeSelect,
  Note,
  RadioGroupField,
  RosterDialogFrame,
  ServerErrorBanner,
  describeError,
  fieldA11y,
  fmtDate,
  formatMoney,
  heldLabel,
  isIsoDate,
  moneyError,
  openDeposit,
  parseMoney,
  useSubmitAttempt,
  type Errors,
  type HeldMethod,
  type ServerErrorView,
} from './form-kit';

type Task = 'record' | 'update' | 'disposition';
type Deposit = NonNullable<RosterLease['deposits']>[number];

function DepositList({ deposits }: { deposits: Deposit[] }) {
  if (deposits.length === 0) return <p className="text-sm text-content-secondary">No deposit is recorded on this lease.</p>;
  return (
    <ul className="space-y-2" aria-label="Deposits on this lease">
      {deposits.map((d) => {
        const late = depositNoticeLate(d.receivedOn, d.noticeSentOn);
        return (
          <li key={d.id} className="rounded-md border border-edge bg-surface-muted px-3 py-2 text-sm">
            <p className="font-medium text-content">
              {formatMoney(d.amount)}
              {d.receivedOn ? ` · received ${fmtDate(d.receivedOn)}` : ''}
            </p>
            <p className="text-content-secondary">
              {heldLabel(d.heldMethod)}
              {d.depository ? ` · ${d.depository}` : ''}
            </p>
            <p className={late ? 'text-status-warning' : 'text-content-secondary'}>
              {d.noticeSentOn
                ? `Notice sent ${fmtDate(d.noticeSentOn)}${late ? ' (late)' : ''}`
                : d.receivedOn
                  ? `Notice due by ${fmtDate(depositNoticeDue(d.receivedOn))}`
                  : 'Notice not recorded'}
            </p>
            {d.disposition ? (
              <p className="text-content-secondary">
                {d.disposition === 'refunded_full'
                  ? `Refunded in full ${fmtDate(d.dispositionOn)}`
                  : `Claim sent ${fmtDate(d.dispositionOn)} · keeping ${formatMoney(d.claimedAmount)}`}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function DepositDialog(props: RosterDialogProps) {
  const { model, lease: leaseProp, today, actions, onDone, onClose } = props;
  const lease = leaseProp ?? model?.current ?? null;
  const deposits = lease?.deposits ?? [];
  const open = openDeposit(lease);
  const lastDay = lease ? (lease.moveOutOn ?? lease.endDate) : null;
  const cancelled = lease?.status === 'cancelled';
  const afterMoveOut = !!open && (cancelled || (!!lastDay && lastDay <= today));

  const [task, setTask] = useState<Task>(afterMoveOut ? 'disposition' : open ? 'update' : 'record');
  // record
  const [amount, setAmount] = useState('');
  const [receivedOn, setReceivedOn] = useState(today);
  const [held, setHeld] = useState('');
  const [depository, setDepository] = useState('');
  const [sentOn, setSentOn] = useState('');
  // update
  const [uSentOn, setUSentOn] = useState(open?.noticeSentOn ?? '');
  const [uHeld, setUHeld] = useState(open?.heldMethod ?? '');
  const [uDepository, setUDepository] = useState(open?.depository ?? '');
  // disposition
  const [disposition, setDisposition] = useState<'refunded_full' | 'claim_sent' | null>(null);
  const [dispositionOn, setDispositionOn] = useState(today);
  const [claimed, setClaimed] = useState('');
  const [serverError, setServerError] = useState<ServerErrorView | null>(null);
  const { tried, guard } = useSubmitAttempt();

  if (!model || !lease) {
    return (
      <RosterDialogFrame title="Deposit" description="Lease not found." onClose={onClose} pending={false} cancelLabel="Close">
        <p className="text-sm text-content-secondary">Close this and try again.</p>
      </RosterDialogFrame>
    );
  }

  const unit = `Unit ${model.unit.unitNumber}`;
  const pending = actions.recordDeposit.isPending || actions.updateDeposit.isPending;
  const sentAfterReceipt = (sent: string, received: string | null) =>
    !isIsoDate(sent)
      ? 'Enter a valid date.'
      : sent > today
        ? 'Must be today or earlier.'
        : received && sent < received
          ? 'Must be on or after the date the deposit was received.'
          : null;

  const claimParsed = parseMoney(claimed);
  const errors: Errors =
    task === 'record'
      ? {
          amount:
            moneyError(amount, 'deposit amount', true) ??
            (parseMoney(amount).amount === 0 ? 'Enter an amount more than $0.' : null),
          receivedOn: !isIsoDate(receivedOn)
            ? 'Enter the date the deposit was received.'
            : receivedOn > today
              ? 'Must be today or earlier.'
              : null,
          held: held ? null : 'Choose how the deposit is held. The deposit notice must say.',
          depository:
            held && held !== 'surety_bond' && !depository.trim()
              ? 'Enter the name and Florida address of the bank that holds the deposit.'
              : null,
          sentOn: sentOn ? sentAfterReceipt(sentOn, isIsoDate(receivedOn) ? receivedOn : null) : null,
        }
      : task === 'update'
        ? {
            uSentOn: uSentOn ? sentAfterReceipt(uSentOn, open?.receivedOn ?? null) : null,
            uDepository:
              uHeld && uHeld !== 'surety_bond' && !uDepository.trim()
                ? 'Enter the name and Florida address of the bank that holds the deposit.'
                : null,
          }
        : {
            disposition: disposition ? null : 'Choose what happened to the deposit.',
            dispositionOn: !isIsoDate(dispositionOn)
              ? 'Enter the date.'
              : dispositionOn > today
                ? 'Must be today or earlier.'
                : null,
            claimed:
              disposition !== 'claim_sent'
                ? null
                : (moneyError(claimed, 'amount kept', true) ??
                  (open && claimParsed.amount > Number(open.amount)
                    ? `Cannot be more than the ${formatMoney(open.amount)} deposit.`
                    : null)),
          };
  const ids: Record<string, string> = {
    amount: 'dp-amount',
    receivedOn: 'dp-received',
    held: 'dp-held',
    depository: 'dp-depository',
    sentOn: 'dp-sent',
    uSentOn: 'dp-u-sent',
    uDepository: 'dp-u-depository',
    disposition: 'dp-disposition-0',
    dispositionOn: 'dp-disposition-on',
    claimed: 'dp-claimed',
  };

  async function submit() {
    if (!guard(errors, ids) || !lease) return;
    setServerError(null);
    try {
      if (task === 'record') {
        const value = parseMoney(amount).value!;
        await actions.recordDeposit.mutateAsync({
          leaseId: lease.id,
          amount: value,
          heldMethod: held as HeldMethod,
          depository: held === 'surety_bond' ? null : depository.trim() || null,
          receivedOn,
          noticeSentOn: sentOn || null,
        });
        onDone(`${formatMoney(value)} deposit recorded for ${unit}.`);
      } else if (task === 'update' && open) {
        await actions.updateDeposit.mutateAsync({
          depositId: open.id,
          noticeSentOn: uSentOn || null,
          heldMethod: (uHeld || null) as HeldMethod | null,
          depository: uHeld === 'surety_bond' ? null : uDepository.trim() || null,
        });
        onDone(`Deposit details updated for ${unit}.`);
      } else if (task === 'disposition' && open) {
        await actions.updateDeposit.mutateAsync({
          depositId: open.id,
          disposition,
          dispositionOn,
          claimedAmount: disposition === 'claim_sent' ? claimParsed.value : null,
        });
        onDone(
          disposition === 'refunded_full'
            ? `Deposit refund recorded for ${unit}.`
            : `Deposit claim recorded for ${unit}.`,
          () =>
            actions.updateDeposit.mutateAsync({
              depositId: open.id,
              disposition: null,
              dispositionOn: null,
              claimedAmount: null,
            }),
        );
      }
    } catch (err) {
      setServerError(describeError(err));
    }
  }

  const taskOptions: Array<{ value: Task; label: string }> = [
    ...(afterMoveOut ? [{ value: 'disposition' as const, label: 'Refund or claim' }] : []),
    ...(open ? [{ value: 'update' as const, label: 'Notice or how it is held' }] : []),
    { value: 'record', label: 'Record a deposit' },
  ];
  const deadlines = lastDay && !cancelled ? depositDispositionDeadlines(lastDay) : null;
  const recordDue = isIsoDate(receivedOn) ? depositNoticeDue(receivedOn) : null;
  const recordLate = isIsoDate(receivedOn) && isIsoDate(sentOn) && depositNoticeLate(receivedOn, sentOn);
  const updateLate = !!open?.receivedOn && isIsoDate(uSentOn) && depositNoticeLate(open.receivedOn, uSentOn);

  return (
    <RosterDialogFrame
      title={`Deposit · ${unit}`}
      description="The deposit record Florida requires: amount, where it is held, the notice, and what happens at move-out."
      onClose={onClose}
      onSubmit={() => void submit()}
      submitLabel={task === 'record' ? 'Record deposit' : task === 'update' ? 'Save' : 'Record'}
      pending={pending}
      size="lg"
    >
      <ServerErrorBanner error={serverError} />
      <DepositList deposits={deposits} />

      {taskOptions.length > 1 ? (
        <RadioGroupField<Task>
          name="dp-task"
          legend="What do you want to record?"
          options={taskOptions}
          value={task}
          onChange={setTask}
          show={false}
          inline
        />
      ) : null}

      {task === 'record' ? (
        <>
          <p className="text-sm text-content-secondary">
            A changed amount is recorded as a new deposit. It restarts the 30-day notice (§83.49(2)).
          </p>
          <Field id="dp-amount" label="Amount" error={errors.amount} show={tried}>
            <Input
              {...fieldA11y('dp-amount', errors.amount, tried)}
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field
            id="dp-received"
            label="Received on"
            hint={recordDue ? `The written notice is due by ${fmtDate(recordDue)} (§83.49(2)).` : undefined}
            error={errors.receivedOn}
            show={tried}
          >
            <Input
              {...fieldA11y('dp-received', errors.receivedOn, tried, true)}
              type="date"
              max={today}
              value={receivedOn}
              onChange={(e) => setReceivedOn(e.target.value)}
            />
          </Field>
          <Field id="dp-held" label="How the deposit is held" error={errors.held} show={tried}>
            <NativeSelect
              {...fieldA11y('dp-held', errors.held, tried)}
              value={held}
              onChange={setHeld}
              placeholder="Choose how the deposit is held"
              options={HELD_OPTIONS}
            />
          </Field>
          {held && held !== 'surety_bond' ? (
            <Field id="dp-depository" label="Bank name and Florida address" error={errors.depository} show={tried}>
              <Input
                {...fieldA11y('dp-depository', errors.depository, tried)}
                value={depository}
                onChange={(e) => setDepository(e.target.value)}
              />
            </Field>
          ) : null}
          <Field
            id="dp-sent"
            label="Notice already sent on"
            optional
            hint="For notices sent on paper or from another system. Leave blank if it has not been sent."
            warning={recordLate ? 'This is after the 30-day deadline. The deposit records it as sent late.' : undefined}
            error={errors.sentOn}
            show={tried}
          >
            <Input
              {...fieldA11y('dp-sent', errors.sentOn, tried, true)}
              type="date"
              max={today}
              value={sentOn}
              onChange={(e) => setSentOn(e.target.value)}
            />
          </Field>
        </>
      ) : null}

      {task === 'update' && open ? (
        <>
          <Field
            id="dp-u-sent"
            label="Notice sent on"
            optional
            hint={
              open.receivedOn ? `Due by ${fmtDate(depositNoticeDue(open.receivedOn))} (§83.49(2)).` : undefined
            }
            warning={updateLate ? 'This is after the 30-day deadline. The deposit records it as sent late.' : undefined}
            error={errors.uSentOn}
            show={tried}
          >
            <Input
              {...fieldA11y('dp-u-sent', errors.uSentOn, tried, true)}
              type="date"
              max={today}
              value={uSentOn}
              onChange={(e) => setUSentOn(e.target.value)}
            />
          </Field>
          <Field id="dp-u-held" label="How the deposit is held" show={false}>
            <NativeSelect
              {...fieldA11y('dp-u-held', null, false)}
              value={uHeld}
              onChange={setUHeld}
              placeholder="Not recorded"
              options={HELD_OPTIONS}
            />
          </Field>
          {uHeld && uHeld !== 'surety_bond' ? (
            <Field id="dp-u-depository" label="Bank name and Florida address" error={errors.uDepository} show={tried}>
              <Input
                {...fieldA11y('dp-u-depository', errors.uDepository, tried)}
                value={uDepository}
                onChange={(e) => setUDepository(e.target.value)}
              />
            </Field>
          ) : null}
        </>
      ) : null}

      {task === 'disposition' && open ? (
        <>
          {deadlines ? (
            <Note>
              Refund in full by {fmtDate(deadlines.refundBy)}, or send a written claim by certified mail by{' '}
              {fmtDate(deadlines.claimBy)} (§83.49(3)).
            </Note>
          ) : null}
          <RadioGroupField<'refunded_full' | 'claim_sent'>
            name="dp-disposition"
            legend={`What happened to the ${formatMoney(open.amount)} deposit?`}
            options={[
              { value: 'refunded_full', label: 'Refunded in full' },
              { value: 'claim_sent', label: 'Claim sent', hint: 'You are keeping part or all of it.' },
            ]}
            value={disposition}
            onChange={setDisposition}
            error={errors.disposition}
            show={tried}
          />
          <Field
            id="dp-disposition-on"
            label={disposition === 'claim_sent' ? 'Claim sent on' : 'Refunded on'}
            error={errors.dispositionOn}
            show={tried}
          >
            <Input
              {...fieldA11y('dp-disposition-on', errors.dispositionOn, tried)}
              type="date"
              max={today}
              value={dispositionOn}
              onChange={(e) => setDispositionOn(e.target.value)}
            />
          </Field>
          {disposition === 'claim_sent' ? (
            <Field
              id="dp-claimed"
              label="Amount kept"
              hint={`Up to ${formatMoney(open.amount)}.`}
              error={errors.claimed}
              show={tried}
            >
              <Input
                {...fieldA11y('dp-claimed', errors.claimed, tried, true)}
                inputMode="decimal"
                autoComplete="off"
                value={claimed}
                onChange={(e) => setClaimed(e.target.value)}
              />
            </Field>
          ) : null}
        </>
      ) : null}
    </RosterDialogFrame>
  );
}
