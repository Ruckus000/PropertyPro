'use client';

/**
 * Send (or resend) a renewal offer on the current lease.
 *
 * The renewal starts the day after the current term ends; a month-to-month
 * lease names its own start, on the 1st of a month (decisions D8). An expired
 * offer is marked expired first; an open one is withdrawn and replaced, since
 * the API allows one open offer per lease.
 */
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { newIdempotencyKey } from '@/hooks/use-lease-roster';
import { addDays, firstOfNextMonth } from '@/lib/leases/roster-model';
import { termEndDate } from '@/lib/leases/lease-state';
import type { RosterDialogProps } from '../types';
import {
  Field,
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
  minDate,
  moneyError,
  moneyInput,
  namesOf,
  openDeposit,
  parseMoney,
  pickedFromPeople,
  rentErrors,
  residentPicks,
  termFromDates,
  useSubmitAttempt,
  type Errors,
  type PickedPerson,
  type ServerErrorView,
  type TermChoice,
} from './form-kit';

export function OfferDialog(props: RosterDialogProps) {
  const { model, today, settings, actions, residents, onDone, onClose } = props;
  const current = model?.current ?? null;
  const isM2M = !current?.endDate;
  const prior = model?.offer ?? null;
  const priorOpen = prior && (prior.stage === 'offer_sent' || prior.stage === 'accepted') ? prior : null;
  const priorExpired = !!priorOpen && priorOpen.stage === 'offer_sent' && priorOpen.expiresOn < today;

  const initialStart = current?.endDate ? addDays(current.endDate, 1) : (prior?.startDate ?? firstOfNextMonth(today));
  const initialPeople = pickedFromPeople(model?.people ?? []);
  const originalKeys = new Set(initialPeople.map((p) => p.key));
  const deposit0 = openDeposit(current);

  const [idempotencyKey] = useState(newIdempotencyKey);
  const [start, setStart] = useState(initialStart);
  const priorEnd = prior
    ? (prior.customEndDate ?? (prior.termMonths ? termEndDate(prior.startDate, prior.termMonths) : null))
    : null;
  const [term, setTerm] = useState<TermChoice>(() => {
    if (!prior) return '12';
    const t = termFromDates(prior.startDate, priorEnd);
    return t === 'm2m' && isM2M ? '12' : t;
  });
  const [customEnd, setCustomEnd] = useState(priorEnd ?? '');
  const [rent, setRent] = useState(moneyInput(prior?.offerRent ?? current?.rentAmount));
  const [zeroReason, setZeroReason] = useState(current?.zeroRentReason ?? '');
  const [deposit, setDeposit] = useState(moneyInput(prior?.depositAmount ?? deposit0?.amount ?? null));
  const [picked, setPicked] = useState<PickedPerson[]>(initialPeople);
  const [draftOpen, setDraftOpen] = useState(false);
  const [expiresOn, setExpiresOn] = useState(minDate(addDays(initialStart, -1), addDays(today, 30)));
  const [cleared, setCleared] = useState(false);
  const [serverError, setServerError] = useState<ServerErrorView | null>(null);
  const { tried, guard } = useSubmitAttempt();

  if (!model || !current) {
    return (
      <RosterDialogFrame
        title="Send renewal offer"
        description="This unit has no current lease to renew."
        onClose={onClose}
        pending={false}
        cancelLabel="Close"
      >
        <p className="text-sm text-content-secondary">Choose a unit with a current lease.</p>
      </RosterDialogFrame>
    );
  }

  const endDate = endDateFor(start, term, customEnd);
  const rentCheck = rentErrors(rent, zeroReason);
  const dep = parseMoney(deposit);
  const currentDep = deposit0 ? Number(deposit0.amount) : 0;
  const depositChanged = dep.value !== null && dep.amount !== currentDep;

  const errors: Errors = {
    residents:
      picked.length === 0
        ? 'Add at least one resident.'
        : !picked.some((p) => originalKeys.has(p.key))
          ? 'Keep at least one current resident on the renewal. For an all-new household, record a move-out and a new lease.'
          : null,
    draft: draftOpen ? 'Finish adding the person without email, or cancel it.' : null,
    start: !isM2M
      ? null
      : !isIsoDate(start)
        ? 'Enter the start of the new term.'
        : !isFirstOfMonth(start)
          ? 'Leases start on the 1st of a month.'
          : start <= current.startDate
            ? `Must start after the current lease began (${fmtDate(current.startDate)}).`
            : null,
    end: customEndError(start, term, customEnd),
    rent: rentCheck.rent,
    zero: rentCheck.zero,
    deposit: moneyError(deposit, 'deposit', false),
    expires: !isIsoDate(expiresOn)
      ? 'Enter the date the offer expires.'
      : expiresOn < today
        ? 'Must be today or later.'
        : isIsoDate(start) && expiresOn >= start
          ? `Must be before the new term starts, ${fmtDate(start)}.`
          : null,
  };
  const ids = {
    residents: 'of-residents',
    draft: 'of-nc-name',
    start: 'of-start',
    end: 'of-end',
    rent: 'of-rent',
    zero: 'of-zero',
    deposit: 'of-deposit',
    expires: 'of-expires',
  };
  const pending = actions.sendOffer.isPending || actions.respondToOffer.isPending;

  async function submit() {
    if (!guard(errors, ids) || !current) return;
    setServerError(null);
    try {
      if (priorOpen && !cleared) {
        await actions.respondToOffer.mutateAsync({ offerId: priorOpen.id, action: priorExpired ? 'expire' : 'withdraw' });
        setCleared(true);
      }
      const offer = await actions.sendOffer.mutateAsync({
        leaseId: current.id,
        offerRent: rentCheck.parsed.value!,
        zeroRentReason: rentCheck.isZero ? zeroReason : null,
        termMonths: term === '6' || term === '12' || term === '18' ? Number(term) : null,
        customEndDate: term === 'custom' ? customEnd : null,
        ...(isM2M ? { startDate: start } : {}),
        depositAmount: dep.value,
        proposedResidents: residentPicks(picked),
        expiresOn,
        idempotencyKey,
      });
      const who = picked[0]?.name ?? 'the resident';
      onDone(
        // Nothing is emailed: the offer is recorded, and the manager delivers it.
        `${priorOpen ? 'Revised offer' : 'Renewal offer'} recorded for ${who}. It expires ${fmtDate(expiresOn)}.`,
        offer?.id ? () => actions.respondToOffer.mutateAsync({ offerId: offer.id, action: 'withdraw' }) : undefined,
      );
    } catch (err) {
      setServerError(describeError(err));
    }
  }

  const noticeDeadline =
    current.endDate && current.noticeDays ? addDays(current.endDate, -current.noticeDays) : null;
  const afterNotice = !!noticeDeadline && noticeDeadline >= today && isIsoDate(expiresOn) && expiresOn > noticeDeadline;

  return (
    <RosterDialogFrame
      title={`${isM2M ? 'Offer a fixed term' : priorOpen ? 'Resend renewal offer' : 'Send renewal offer'} · Unit ${model.unit.unitNumber}`}
      description={`${namesOf(model.people)}. ${
        isM2M ? `Month-to-month since ${fmtDate(current.startDate)}.` : `Current term ends ${fmtDate(current.endDate)}.`
      }`}
      onClose={onClose}
      onSubmit={() => void submit()}
      submitLabel={priorOpen ? 'Resend offer' : 'Send offer'}
      pending={pending}
      size="lg"
    >
      <ServerErrorBanner error={serverError} />
      <p className="text-sm text-content-secondary">
        PropertyPro records the offer and tracks the response. It does not email the resident, so give them the offer
        the way you normally would.
      </p>
      {priorOpen ? (
        <p className="text-sm text-content-secondary">
          {priorExpired
            ? `The last offer expired ${fmtDate(priorOpen.expiresOn)}. It is closed when this one is sent.`
            : 'The open offer is withdrawn and replaced by this one.'}
        </p>
      ) : null}

      {isM2M ? (
        <Field
          id="of-start"
          label="New term starts"
          hint="Leases start on the 1st of a month. The current tenancy ends the day before."
          error={errors.start}
          show={tried}
        >
          <Input
            {...fieldA11y('of-start', errors.start, tried, true)}
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
      ) : (
        <p className="text-sm text-content">
          The new term starts {fmtDate(start)}, the day after the current lease ends.
        </p>
      )}

      <TermFields
        idPrefix="of"
        start={start}
        term={term}
        onTerm={setTerm}
        customEnd={customEnd}
        onCustomEnd={setCustomEnd}
        error={errors.end ?? null}
        show={tried}
        allowMonthToMonth={!isM2M}
      />

      <RentFields
        idPrefix="of"
        label="Offered rent"
        rent={rent}
        onRent={setRent}
        zeroReason={zeroReason}
        onZeroReason={setZeroReason}
        errors={{ rent: rentCheck.rent, zero: rentCheck.zero, isZero: rentCheck.isZero }}
        show={tried}
        hint={current.rentAmount ? `Current rent ${formatMoney(current.rentAmount)}.` : undefined}
      />

      <Field
        id="of-deposit"
        label="Security deposit"
        optional
        hint={
          depositChanged
            ? `Changed from ${formatMoney(String(currentDep))}. A changed deposit restarts the written notice (§83.49(2)).`
            : 'Leave as is to keep the current deposit.'
        }
        error={errors.deposit}
        show={tried}
      >
        <Input
          {...fieldA11y('of-deposit', errors.deposit, tried, true)}
          inputMode="decimal"
          autoComplete="off"
          value={deposit}
          onChange={(e) => setDeposit(e.target.value)}
        />
      </Field>

      <ResidentsPicker
        idPrefix="of"
        residents={residents}
        picked={picked}
        onChange={setPicked}
        allowWithoutEmail={settings.allowResidentsWithoutEmail}
        occupants={props.occupants.filter((o) => o.unitId === model.unit.id)}
        error={errors.residents ?? (tried ? errors.draft : null) ?? null}
        show={tried}
        hint="Everyone on the new term. Remove anyone moving out, or add a co-tenant."
        onDraftOpen={setDraftOpen}
      />

      <Field
        id="of-expires"
        label="Offer expires on"
        hint="After this date the resident can no longer accept."
        warning={
          afterNotice && noticeDeadline
            ? `This is after the ${current.noticeDays}-day notice deadline, ${fmtDate(noticeDeadline)}. A resident who declines after that may not have given the notice the lease requires (§83.575).`
            : undefined
        }
        error={errors.expires}
        show={tried}
      >
        <Input
          {...fieldA11y('of-expires', errors.expires, tried, true)}
          type="date"
          min={today}
          value={expiresOn}
          onChange={(e) => setExpiresOn(e.target.value)}
        />
      </Field>

      {endDate ? (
        <p className="text-sm text-content-secondary">
          New term: {fmtDate(start)} – {fmtDate(endDate)}.
        </p>
      ) : null}
    </RosterDialogFrame>
  );
}
