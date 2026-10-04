'use client';

/**
 * New lease (vacant unit or pre-lease) and Edit lease (current or upcoming).
 *
 * New: unit, residents, start (the 1st of a month — decisions D8), term, rent
 * ($0 needs a reason), deposit with how it is held and the §83.49 notice,
 * notice days (§83.575) and notes. Edit: rent, end date (upcoming leases only),
 * notice days and notes, sent with `version` so a stale edit is a 409.
 */
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { newIdempotencyKey, type DepositInput } from '@/hooks/use-lease-roster';
import { defaultStartFor, peopleOn, type RosterLease, type UnitModel } from '@/lib/leases/roster-model';
import { depositNoticeDue, depositNoticeLate } from '@/lib/leases/lease-state';
import type { RosterDialogProps } from '../types';
import {
  Field,
  HELD_OPTIONS,
  NativeSelect,
  NoticeDaysField,
  RadioGroupField,
  RentFields,
  ResidentsPicker,
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
  moneyError,
  moneyInput,
  namesOf,
  noticeDaysError,
  parseMoney,
  rentErrors,
  residentPicks,
  termFromDates,
  useSubmitAttempt,
  type Errors,
  type HeldMethod,
  type PickedPerson,
  type ServerErrorView,
  type TermChoice,
} from './form-kit';

export type LeaseFormDialogProps = RosterDialogProps & { mode: 'new' | 'edit' };

export function LeaseFormDialog(props: LeaseFormDialogProps) {
  if (props.mode === 'edit') {
    const lease = props.lease ?? props.model?.current ?? props.model?.next ?? null;
    if (lease && props.model) return <EditLeaseForm {...props} model={props.model} lease={lease} />;
  }
  return <NewLeaseForm {...props} />;
}

// ── New ──────────────────────────────────────────────────────────────────────

type NoticeMode = 'now' | 'sent' | 'later';

function unitOptionLabel(m: UnitModel): string {
  const from = m.state.availableFrom;
  const where = m.state.current
    ? `available from ${fmtDate(from)} (pre-lease)`
    : from
      ? `vacant, available from ${fmtDate(from)}`
      : 'vacant';
  return `Unit ${m.unit.unitNumber} · ${where}`;
}

function NewLeaseForm(props: LeaseFormDialogProps) {
  const { model, models, today, settings, actions, residents, onDone, onClose } = props;
  const options = useMemo(
    () =>
      models
        .filter((m) => m.state.canLease)
        .sort((a, b) => a.unit.unitNumber.localeCompare(b.unit.unitNumber, undefined, { numeric: true })),
    [models],
  );
  const initial = (model && model.state.canLease ? model : null) ?? options[0] ?? null;

  const [idempotencyKey] = useState(newIdempotencyKey);
  const [unitId, setUnitId] = useState(initial ? String(initial.unit.id) : '');
  const [picked, setPicked] = useState<PickedPerson[]>([]);
  const [draftOpen, setDraftOpen] = useState(false);
  const [start, setStart] = useState(initial ? defaultStartFor(initial, today) : '');
  const [term, setTerm] = useState<TermChoice>('12');
  const [customEnd, setCustomEnd] = useState('');
  const [rent, setRent] = useState(moneyInput(initial?.unit.rentAmount));
  const [zeroReason, setZeroReason] = useState('');
  const [deposit, setDeposit] = useState('');
  const [held, setHeld] = useState('');
  const [depository, setDepository] = useState('');
  const [receivedOn, setReceivedOn] = useState(today);
  const [noticeMode, setNoticeMode] = useState<NoticeMode>('later');
  const [sentOn, setSentOn] = useState('');
  const [noticeDays, setNoticeDays] = useState('60');
  const [notes, setNotes] = useState('');
  const [serverError, setServerError] = useState<ServerErrorView | null>(null);
  const { tried, guard } = useSubmitAttempt();

  const unit = options.find((m) => String(m.unit.id) === unitId) ?? null;
  const pending = actions.createLease.isPending;

  if (options.length === 0) {
    return (
      <RosterDialogFrame
        title="New lease"
        description="No unit can take a new lease right now."
        onClose={onClose}
        pending={false}
        cancelLabel="Close"
      >
        <p className="text-sm text-content-secondary">
          Every unit is leased, pre-leased or offline. Record a move-out on a unit to pre-lease it.
        </p>
      </RosterDialogFrame>
    );
  }

  // ── Validation ──
  const avail = unit?.state.availableFrom ?? null;
  const endDate = endDateFor(start, term, customEnd);
  const rentCheck = rentErrors(rent, zeroReason);
  const dep = parseMoney(deposit);
  const hasDeposit = dep.value !== null && dep.amount > 0;
  const due = hasDeposit && isIsoDate(receivedOn) ? depositNoticeDue(receivedOn) : null;
  const late = noticeMode === 'sent' && isIsoDate(sentOn) && depositNoticeLate(receivedOn, sentOn);

  const errors: Errors = {
    unit: unit ? null : 'Choose a unit.',
    residents: picked.length === 0 ? 'Add at least one resident. The first person added is the primary resident.' : null,
    draft: draftOpen ? 'Finish adding the person without email, or cancel it.' : null,
    start: !isIsoDate(start)
      ? 'Enter a start date.'
      : !isFirstOfMonth(start)
        ? 'Leases start on the 1st of a month.'
        : avail && start < avail
          ? `This unit is available from ${fmtDate(avail)}. Start on or after that date.`
          : null,
    end: customEndError(start, term, customEnd),
    rent: rentCheck.rent,
    zero: rentCheck.zero,
    deposit: moneyError(deposit, 'security deposit', false),
    held: hasDeposit && !held ? 'Choose how the deposit is held. The deposit notice must say.' : null,
    depository:
      hasDeposit && held && held !== 'surety_bond' && depository.trim().length === 0
        ? 'Enter the name and Florida address of the bank that holds the deposit.'
        : null,
    receivedOn: !hasDeposit
      ? null
      : !isIsoDate(receivedOn)
        ? 'Enter the date the deposit was received.'
        : receivedOn > today
          ? 'Must be today or earlier.'
          : null,
    sentOn:
      !hasDeposit || noticeMode !== 'sent'
        ? null
        : !isIsoDate(sentOn)
          ? 'Enter the date the notice was sent.'
          : sentOn > today
            ? 'Must be today or earlier.'
            : isIsoDate(receivedOn) && sentOn < receivedOn
              ? 'Must be on or after the date the deposit was received.'
              : null,
    noticeDays: term !== 'm2m' ? noticeDaysError(noticeDays) : null,
    notes: rentCheck.isZero && zeroReason === 'other' && !notes.trim() ? 'Explain why there is no rent.' : null,
  };
  const ids: Record<string, string> = {
    unit: 'lf-unit',
    residents: 'lf-residents',
    draft: 'lf-nc-name',
    start: 'lf-start',
    end: 'lf-end',
    rent: 'lf-rent',
    zero: 'lf-zero',
    deposit: 'lf-deposit',
    held: 'lf-held',
    depository: 'lf-depository',
    receivedOn: 'lf-received',
    sentOn: 'lf-sent',
    noticeDays: 'lf-notice-days',
    notes: 'lf-notes',
  };

  function pickUnit(value: string) {
    setUnitId(value);
    const m = options.find((x) => String(x.unit.id) === value);
    if (m) {
      setStart(defaultStartFor(m, today));
      setRent(moneyInput(m.unit.rentAmount));
    }
  }

  async function submit() {
    if (!guard(errors, ids) || !unit) return;
    setServerError(null);
    const depositInput: DepositInput | null = hasDeposit
      ? {
          amount: dep.value!,
          heldMethod: held as HeldMethod,
          depository: held === 'surety_bond' ? null : depository.trim() || null,
          receivedOn,
          noticeSentOn: noticeMode === 'now' ? today : noticeMode === 'sent' ? sentOn : null,
        }
      : null;
    try {
      await actions.createLease.mutateAsync({
        unitId: unit.unit.id,
        residents: residentPicks(picked),
        startDate: start,
        endDate,
        rentAmount: rentCheck.parsed.value!,
        zeroRentReason: rentCheck.isZero ? zeroReason : null,
        noticeDays: endDate ? Number(noticeDays) : null,
        deposit: depositInput,
        notes: notes.trim() || null,
        idempotencyKey,
      });
      onDone(
        `Lease created for Unit ${unit.unit.unitNumber}.${start > today ? ` It starts ${fmtDate(start)}.` : ''}`,
      );
    } catch (err) {
      setServerError(describeError(err));
    }
  }

  const startHint =
    unit?.state.current && unit.state.stopDate
      ? `Occupied through ${fmtDate(unit.state.stopDate)}. Leases start on the 1st of a month.`
      : 'Leases start on the 1st of a month.';

  return (
    <RosterDialogFrame
      title="New lease"
      description="Create a lease for a vacant unit, or pre-lease a unit that has a move-out date."
      onClose={onClose}
      onSubmit={() => void submit()}
      submitLabel="Create lease"
      pending={pending}
      size="lg"
    >
      <ServerErrorBanner error={serverError} />
      <Field
        id="lf-unit"
        label="Unit"
        hint="Vacant units and units with a recorded move-out are listed. Offline units are not."
        error={errors.unit}
        show={tried}
      >
        <NativeSelect
          {...fieldA11y('lf-unit', errors.unit, tried, true)}
          value={unitId}
          onChange={pickUnit}
          options={options.map((m) => ({ value: String(m.unit.id), label: unitOptionLabel(m) }))}
        />
      </Field>

      <ResidentsPicker
        idPrefix="lf"
        residents={residents}
        picked={picked}
        onChange={setPicked}
        allowWithoutEmail={settings.allowResidentsWithoutEmail}
        occupants={props.occupants.filter((o) => String(o.unitId) === String(unitId))}
        error={errors.residents ?? (tried ? errors.draft : null) ?? null}
        show={tried}
        hint="Everyone who signs the lease. The first person added is the primary resident."
        onDraftOpen={setDraftOpen}
      />

      <Field id="lf-start" label="Start date" hint={startHint} error={errors.start} show={tried}>
        <Input
          {...fieldA11y('lf-start', errors.start, tried, true)}
          type="date"
          min={avail ?? undefined}
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </Field>

      <TermFields
        idPrefix="lf"
        start={start}
        term={term}
        onTerm={setTerm}
        customEnd={customEnd}
        onCustomEnd={setCustomEnd}
        error={errors.end ?? null}
        show={tried}
      />

      <RentFields
        idPrefix="lf"
        rent={rent}
        onRent={setRent}
        zeroReason={zeroReason}
        onZeroReason={setZeroReason}
        errors={{ rent: rentCheck.rent, zero: rentCheck.zero, isZero: rentCheck.isZero }}
        show={tried}
        hint={unit?.unit.rentAmount ? `Rent on file for this unit: ${formatMoney(unit.unit.rentAmount)}.` : undefined}
      />

      <Field
        id="lf-deposit"
        label="Security deposit"
        optional
        hint="Florida sets no cap. Leave blank or enter 0 if none was collected."
        error={errors.deposit}
        show={tried}
      >
        <Input
          {...fieldA11y('lf-deposit', errors.deposit, tried, true)}
          inputMode="decimal"
          autoComplete="off"
          value={deposit}
          onChange={(e) => setDeposit(e.target.value)}
        />
      </Field>

      {hasDeposit ? (
        <>
          <Field
            id="lf-held"
            label="How the deposit is held"
            hint="Florida law requires one of these options (§83.49)."
            error={errors.held}
            show={tried}
          >
            <NativeSelect
              {...fieldA11y('lf-held', errors.held, tried, true)}
              value={held}
              onChange={setHeld}
              placeholder="Choose how the deposit is held"
              options={HELD_OPTIONS}
            />
          </Field>
          {held && held !== 'surety_bond' ? (
            <Field
              id="lf-depository"
              label="Bank name and Florida address"
              hint="Appears on the deposit notice sent to residents."
              error={errors.depository}
              show={tried}
            >
              <Input
                {...fieldA11y('lf-depository', errors.depository, tried, true)}
                value={depository}
                onChange={(e) => setDepository(e.target.value)}
              />
            </Field>
          ) : null}
          <Field
            id="lf-received"
            label="Deposit received on"
            hint={due ? `The written notice is due by ${fmtDate(due)} (§83.49(2)).` : undefined}
            error={errors.receivedOn}
            show={tried}
          >
            <Input
              {...fieldA11y('lf-received', errors.receivedOn, tried, true)}
              type="date"
              max={today}
              value={receivedOn}
              onChange={(e) => setReceivedOn(e.target.value)}
            />
          </Field>
          <RadioGroupField<NoticeMode>
            name="lf-notice-mode"
            legend="Deposit notice"
            options={[
              // PropertyPro does not send the §83.49 notice itself (yet), so
              // these options RECORD what the manager did — never claim a send
              // that did not happen.
              { value: 'now', label: 'I sent it today', hint: 'Records the written notice as sent today.' },
              { value: 'sent', label: 'Sent on another date', hint: 'For notices sent on paper or from another system.' },
              {
                value: 'later',
                label: 'Not sent yet',
                hint: due
                  ? `${due < today ? 'Overdue since' : 'Due by'} ${fmtDate(due)}. The lease shows the notice as due until it is sent.`
                  : 'The lease shows the notice as due until it is sent.',
              },
            ]}
            value={noticeMode}
            onChange={setNoticeMode}
            show={tried}
          />
          {noticeMode === 'sent' ? (
            <Field
              id="lf-sent"
              label="Notice sent on"
              warning={late ? 'This is after the 30-day deadline. The lease records it as sent late.' : undefined}
              error={errors.sentOn}
              show={tried}
            >
              <Input
                {...fieldA11y('lf-sent', errors.sentOn, tried, late)}
                type="date"
                max={today}
                value={sentOn}
                onChange={(e) => setSentOn(e.target.value)}
              />
            </Field>
          ) : null}
        </>
      ) : null}

      {term !== 'm2m' ? (
        <NoticeDaysField
          id="lf-notice-days"
          value={noticeDays}
          onChange={setNoticeDays}
          error={errors.noticeDays ?? null}
          show={tried}
        />
      ) : null}

      <Field
        id="lf-notes"
        label="Notes"
        optional={!(rentCheck.isZero && zeroReason === 'other')}
        error={errors.notes}
        show={tried}
      >
        <Textarea
          {...fieldA11y('lf-notes', errors.notes, tried)}
          rows={3}
          placeholder="Pets, parking space, concessions…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
    </RosterDialogFrame>
  );
}

// ── Edit ─────────────────────────────────────────────────────────────────────

function EditLeaseForm(props: LeaseFormDialogProps & { model: UnitModel; lease: RosterLease }) {
  const { model, lease, today, actions, directory, onDone, onClose } = props;
  const upcoming = lease.startDate > today;
  const isRenewalTerm = upcoming && !!model.current && lease.previousLeaseId === model.current.id;
  const editDates = upcoming && !isRenewalTerm;

  const [term, setTerm] = useState<TermChoice>(termFromDates(lease.startDate, lease.endDate));
  const [customEnd, setCustomEnd] = useState(lease.endDate ?? '');
  const [rent, setRent] = useState(moneyInput(lease.rentAmount));
  const [zeroReason, setZeroReason] = useState(lease.zeroRentReason ?? '');
  const [noticeDays, setNoticeDays] = useState(String(lease.noticeDays ?? 60));
  const [notes, setNotes] = useState(lease.notes ?? '');
  const [serverError, setServerError] = useState<ServerErrorView | null>(null);
  const { tried, guard } = useSubmitAttempt();

  const names = namesOf(peopleOn(lease, directory));

  const endDate = editDates ? endDateFor(lease.startDate, term, customEnd) : lease.endDate;
  const rentCheck = rentErrors(rent, zeroReason);
  const errors: Errors = {
    end: editDates ? customEndError(lease.startDate, term, customEnd) : null,
    rent: rentCheck.rent,
    zero: rentCheck.zero,
    noticeDays: endDate ? noticeDaysError(noticeDays) : null,
    notes: rentCheck.isZero && zeroReason === 'other' && !notes.trim() ? 'Explain why there is no rent.' : null,
  };
  const ids = { end: 'le-end', rent: 'le-rent', zero: 'le-zero', noticeDays: 'le-notice-days', notes: 'le-notes' };
  const pending = actions.updateLease.isPending;
  const stale = serverError?.status === 409;

  async function submit() {
    if (!guard(errors, ids)) return;
    setServerError(null);
    try {
      await actions.updateLease.mutateAsync({
        id: lease.id,
        version: lease.version,
        rentAmount: rentCheck.parsed.value!,
        zeroRentReason: rentCheck.isZero ? zeroReason : null,
        ...(editDates ? { endDate } : {}),
        noticeDays: endDate ? Number(noticeDays) : null,
        notes: notes.trim() || null,
      });
      onDone(`${upcoming ? 'Upcoming lease' : 'Lease'} for Unit ${model.unit.unitNumber} updated.`);
    } catch (err) {
      setServerError(describeError(err));
    }
  }

  const title = `${isRenewalTerm ? 'Edit renewal term' : upcoming ? 'Edit upcoming lease' : 'Edit lease'} · Unit ${model.unit.unitNumber}`;
  const description = upcoming
    ? `${names}. Starts ${fmtDate(lease.startDate)}.`
    : `Correct the lease record for ${names}.`;

  return (
    <RosterDialogFrame
      title={title}
      description={description}
      onClose={onClose}
      onSubmit={() => void submit()}
      submitLabel="Save changes"
      pending={pending}
    >
      <ServerErrorBanner
        error={stale && serverError ? { ...serverError, message: 'This lease changed since you opened it.' } : serverError}
        action={
          stale ? (
            <Button type="button" size="sm" variant="outline" onClick={onClose}>
              Reload
            </Button>
          ) : undefined
        }
      />
      {editDates ? (
        <TermFields
          idPrefix="le"
          start={lease.startDate}
          term={term}
          onTerm={setTerm}
          customEnd={customEnd}
          onCustomEnd={setCustomEnd}
          error={errors.end ?? null}
          show={tried}
        />
      ) : (
        <p className="text-sm text-content-secondary">
          {fmtDate(lease.startDate)} – {lease.endDate ? fmtDate(lease.endDate) : 'no end date'}.{' '}
          {isRenewalTerm
            ? 'Renewal dates follow the current lease.'
            : 'To change dates, renew the lease or end it early from the unit panel.'}
        </p>
      )}
      <RentFields
        idPrefix="le"
        rent={rent}
        onRent={setRent}
        zeroReason={zeroReason}
        onZeroReason={setZeroReason}
        errors={{ rent: rentCheck.rent, zero: rentCheck.zero, isZero: rentCheck.isZero }}
        show={tried}
        hint={upcoming ? undefined : 'For corrections. Rent normally changes at renewal.'}
      />
      {endDate ? (
        <NoticeDaysField
          id="le-notice-days"
          value={noticeDays}
          onChange={setNoticeDays}
          error={errors.noticeDays ?? null}
          show={tried}
        />
      ) : null}
      <Field
        id="le-notes"
        label="Notes"
        optional={!(rentCheck.isZero && zeroReason === 'other')}
        error={errors.notes}
        show={tried}
      >
        <Textarea
          {...fieldA11y('le-notes', errors.notes, tried)}
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
    </RosterDialogFrame>
  );
}
