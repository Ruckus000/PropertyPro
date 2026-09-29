'use client';

/**
 * Transfer the current residents to another unit: the current lease ends on
 * the last day (as a transfer) and a new lease starts on the 1st of a month
 * after it (decisions D8), with the deposit carried over by default.
 */
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { newIdempotencyKey } from '@/hooks/use-lease-roster';
import { addDays, defaultStartFor, firstOfNextMonth, type UnitModel } from '@/lib/leases/roster-model';
import type { RosterDialogProps } from '../types';
import {
  Field,
  NativeSelect,
  Note,
  NoticeDaysField,
  RentFields,
  RosterDialogFrame,
  ServerErrorBanner,
  TermFields,
  customEndError,
  describeError,
  endDateFor,
  fieldA11y,
  fmtDate,
  formatMoney,
  isFirstOfMonth,
  isIsoDate,
  maxDate,
  moneyError,
  moneyInput,
  namesOf,
  noticeDaysError,
  openDeposit,
  parseMoney,
  rentErrors,
  useSubmitAttempt,
  type Errors,
  type ServerErrorView,
  type TermChoice,
} from './form-kit';

/** Transfer destinations: units that can take a lease, other than this one. */
export function transferTargets(models: UnitModel[], fromUnitId: number | null): UnitModel[] {
  return models
    .filter((m) => m.state.canLease && m.unit.id !== fromUnitId)
    .sort((a, b) => a.unit.unitNumber.localeCompare(b.unit.unitNumber, undefined, { numeric: true }));
}

function startAfter(lastDay: string, dest: UnitModel | null, today: string): string {
  const afterLast = isIsoDate(lastDay) ? firstOfNextMonth(lastDay) : firstOfNextMonth(today);
  return dest ? maxDate(afterLast, defaultStartFor(dest, today)) : afterLast;
}

export function TransferDialog(props: RosterDialogProps) {
  const { model, models, today, actions, onDone, onClose } = props;
  const current = model?.current ?? null;
  const targets = useMemo(() => transferTargets(models, model?.unit.id ?? null), [models, model]);
  const deposit0 = openDeposit(current);
  const initialDest = targets[0] ?? null;
  const initialLast = addDays(firstOfNextMonth(today), -1);

  const [idempotencyKey] = useState(newIdempotencyKey);
  const [toUnitId, setToUnitId] = useState(initialDest ? String(initialDest.unit.id) : '');
  const [lastDay, setLastDay] = useState(initialLast);
  const [start, setStart] = useState(startAfter(initialLast, initialDest, today));
  const [term, setTerm] = useState<TermChoice>('12');
  const [customEnd, setCustomEnd] = useState('');
  const [rent, setRent] = useState(moneyInput(initialDest?.unit.rentAmount));
  const [zeroReason, setZeroReason] = useState('');
  const [noticeDays, setNoticeDays] = useState(String(current?.noticeDays ?? 60));
  const [carry, setCarry] = useState(!!deposit0);
  const [newDeposit, setNewDeposit] = useState('');
  const [reason, setReason] = useState('');
  const [serverError, setServerError] = useState<ServerErrorView | null>(null);
  const { tried, guard } = useSubmitAttempt();

  if (!model || !current) {
    return (
      <RosterDialogFrame
        title="Transfer to another unit"
        description="This unit has no current lease to transfer."
        onClose={onClose}
        pending={false}
        cancelLabel="Close"
      >
        <p className="text-sm text-content-secondary">Choose a unit with a current lease.</p>
      </RosterDialogFrame>
    );
  }

  const unit = `Unit ${model.unit.unitNumber}`;
  if (targets.length === 0) {
    return (
      <RosterDialogFrame
        title={`Transfer to another unit · ${unit}`}
        description="No other unit can take a new lease right now."
        onClose={onClose}
        pending={false}
        cancelLabel="Close"
      >
        <p className="text-sm text-content-secondary">
          Every other unit is leased, pre-leased or offline. Record a move-out on a unit to transfer into it.
        </p>
      </RosterDialogFrame>
    );
  }

  const dest = targets.find((m) => String(m.unit.id) === toUnitId) ?? null;
  const avail = dest?.state.availableFrom ?? null;
  const endDate = endDateFor(start, term, customEnd);
  const rentCheck = rentErrors(rent, zeroReason);
  const dep = parseMoney(newDeposit);

  const errors: Errors = {
    to: dest ? null : 'Choose the new unit.',
    lastDay: !isIsoDate(lastDay)
      ? 'Enter the last day in the current unit.'
      : lastDay < today
        ? 'Must be today or later.'
        : lastDay < current.startDate
          ? `Must be on or after the lease start, ${fmtDate(current.startDate)}.`
          : null,
    start: !isIsoDate(start)
      ? 'Enter the move-in date for the new unit.'
      : !isFirstOfMonth(start)
        ? 'Leases start on the 1st of a month.'
        : isIsoDate(lastDay) && start <= lastDay
          ? 'Must be after the last day in the current unit.'
          : avail && start < avail
            ? `Unit ${dest?.unit.unitNumber} is available from ${fmtDate(avail)}. Start on or after that date.`
            : null,
    end: customEndError(start, term, customEnd),
    rent: rentCheck.rent,
    zero: rentCheck.zero,
    deposit: carry ? moneyError(newDeposit, 'new deposit', false) : null,
    noticeDays: term !== 'm2m' ? noticeDaysError(noticeDays) : null,
  };
  const ids = {
    to: 'tr-unit',
    lastDay: 'tr-last-day',
    start: 'tr-start',
    end: 'tr-end',
    rent: 'tr-rent',
    zero: 'tr-zero',
    deposit: 'tr-deposit',
    noticeDays: 'tr-notice-days',
  };
  const pending = actions.transfer.isPending;

  function pickDest(value: string) {
    setToUnitId(value);
    const m = targets.find((x) => String(x.unit.id) === value) ?? null;
    setStart(startAfter(lastDay, m, today));
    if (m) setRent(moneyInput(m.unit.rentAmount));
  }

  function changeLastDay(value: string) {
    setLastDay(value);
    if (isIsoDate(value)) setStart(startAfter(value, dest, today));
  }

  async function submit() {
    if (!guard(errors, ids) || !dest || !current) return;
    setServerError(null);
    try {
      await actions.transfer.mutateAsync({
        fromLeaseId: current.id,
        toUnitId: dest.unit.id,
        moveOutOn: lastDay,
        startDate: start,
        endDate,
        rentAmount: rentCheck.parsed.value!,
        zeroRentReason: rentCheck.isZero ? zeroReason : null,
        noticeDays: endDate ? Number(noticeDays) : null,
        carryDeposit: carry,
        depositAmount: carry ? dep.value : null,
        reason: reason.trim() || null,
        idempotencyKey,
      });
      onDone(
        `Transfer recorded. ${model?.people[0]?.name ?? 'The resident'} moves to Unit ${dest.unit.unitNumber} on ${fmtDate(start)}.`,
      );
    } catch (err) {
      setServerError(describeError(err));
    }
  }

  return (
    <RosterDialogFrame
      title={`Transfer to another unit · ${unit}`}
      description={`${namesOf(model.people)} ${model.people.length > 1 ? 'move' : 'moves'} to another unit on a new lease.`}
      onClose={onClose}
      onSubmit={() => void submit()}
      submitLabel="Record transfer"
      pending={pending}
      size="lg"
    >
      <ServerErrorBanner error={serverError} />
      <Field
        id="tr-unit"
        label="New unit"
        hint={
          dest?.state.current && dest.state.stopDate
            ? `Occupied through ${fmtDate(dest.state.stopDate)}.`
            : 'Vacant units and units with a recorded move-out are listed.'
        }
        error={errors.to}
        show={tried}
      >
        <NativeSelect
          {...fieldA11y('tr-unit', errors.to, tried, true)}
          value={toUnitId}
          onChange={pickDest}
          options={targets.map((m) => ({
            value: String(m.unit.id),
            label: `Unit ${m.unit.unitNumber}${m.state.availableFrom ? ` · available from ${fmtDate(m.state.availableFrom)}` : ' · vacant'}`,
          }))}
        />
      </Field>

      <Field
        id="tr-last-day"
        label={`Last day in ${unit}`}
        hint="The current lease ends on this day as a transfer."
        error={errors.lastDay}
        show={tried}
      >
        <Input
          {...fieldA11y('tr-last-day', errors.lastDay, tried, true)}
          type="date"
          min={today}
          value={lastDay}
          onChange={(e) => changeLastDay(e.target.value)}
        />
      </Field>

      <Field
        id="tr-start"
        label="New lease starts"
        hint="Leases start on the 1st of a month, after the last day in the current unit."
        error={errors.start}
        show={tried}
      >
        <Input
          {...fieldA11y('tr-start', errors.start, tried, true)}
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </Field>

      <TermFields
        idPrefix="tr"
        start={start}
        term={term}
        onTerm={setTerm}
        customEnd={customEnd}
        onCustomEnd={setCustomEnd}
        error={errors.end ?? null}
        show={tried}
      />

      <RentFields
        idPrefix="tr"
        rent={rent}
        onRent={setRent}
        zeroReason={zeroReason}
        onZeroReason={setZeroReason}
        errors={{ rent: rentCheck.rent, zero: rentCheck.zero, isZero: rentCheck.isZero }}
        show={tried}
        hint={current.rentAmount ? `Current rent ${formatMoney(current.rentAmount)}.` : undefined}
      />

      {term !== 'm2m' ? (
        <NoticeDaysField
          id="tr-notice-days"
          value={noticeDays}
          onChange={setNoticeDays}
          error={errors.noticeDays ?? null}
          show={tried}
        />
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Switch id="tr-carry" checked={carry} onCheckedChange={setCarry} disabled={!deposit0} />
          <Label htmlFor="tr-carry">Carry the deposit to the new lease</Label>
        </div>
        <p className="text-sm text-content-secondary">
          {deposit0
            ? carry
              ? `The ${formatMoney(deposit0.amount)} deposit moves with the residents. No refund or claim is due for ${unit}.`
              : `The ${formatMoney(deposit0.amount)} deposit is settled on move-out from ${unit} (§83.49(3)).`
            : 'There is no open deposit on this lease to carry over.'}
        </p>
      </div>

      {carry ? (
        <Field
          id="tr-deposit"
          label="New deposit amount"
          optional
          hint="Leave blank to keep the same amount. A changed deposit needs a new written notice (§83.49(2))."
          error={errors.deposit}
          show={tried}
        >
          <Input
            {...fieldA11y('tr-deposit', errors.deposit, tried, true)}
            inputMode="decimal"
            autoComplete="off"
            value={newDeposit}
            onChange={(e) => setNewDeposit(e.target.value)}
          />
        </Field>
      ) : null}

      <Field id="tr-reason" label="Reason" optional show={false}>
        <Textarea
          id="tr-reason"
          rows={2}
          placeholder="Reason for the transfer, fees, keys…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>

      {dest && isIsoDate(lastDay) && isIsoDate(start) ? (
        <Note>
          {unit}’s lease ends {fmtDate(lastDay)} as a transfer, and Unit {dest.unit.unitNumber}’s lease starts{' '}
          {fmtDate(start)}.
        </Note>
      ) : null}
    </RosterDialogFrame>
  );
}
