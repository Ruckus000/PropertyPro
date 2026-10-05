'use client';

/**
 * Record the resident's answer to an open renewal offer: accepted, declined
 * (schedules the move-out), or withdraw the offer.
 */
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import type { RosterOffer } from '@/lib/leases/roster-model';
import { termEndDate } from '@/lib/leases/lease-state';
import type { RosterDialogProps } from '../types';
import {
  Field,
  RadioGroupField,
  RosterDialogFrame,
  ServerErrorBanner,
  Summary,
  describeError,
  fieldA11y,
  fmtDate,
  formatMoney,
  isIsoDate,
  namesOf,
  useSubmitAttempt,
  type Errors,
  type ServerErrorView,
} from './form-kit';

type Response = 'accept' | 'decline' | 'withdraw';

export function offerTermText(offer: RosterOffer): string {
  if (offer.customEndDate) return `Through ${fmtDate(offer.customEndDate)}`;
  if (offer.termMonths) return `${offer.termMonths} months, through ${fmtDate(termEndDate(offer.startDate, offer.termMonths))}`;
  return 'Month-to-month';
}

export function OfferSummary({ offer }: { offer: RosterOffer }) {
  return (
    <Summary
      rows={[
        ['Rent', `${formatMoney(offer.offerRent)} / month`],
        ['Term', offerTermText(offer)],
        ['Starts', fmtDate(offer.startDate)],
        ['Deposit', offer.depositAmount ? formatMoney(offer.depositAmount) : 'Unchanged'],
        ['Sent', fmtDate(offer.sentOn)],
        ['Expires', fmtDate(offer.expiresOn)],
      ]}
    />
  );
}

export function OfferResponseDialog(props: RosterDialogProps) {
  const { model, today, actions, onDone, onClose } = props;
  const offer = model?.offer && (model.offer.stage === 'offer_sent' || model.offer.stage === 'accepted') ? model.offer : null;
  const current = model?.current ?? null;

  const [response, setResponse] = useState<Response | null>(null);
  const [moveOutOn, setMoveOutOn] = useState(current?.endDate ?? '');
  const [serverError, setServerError] = useState<ServerErrorView | null>(null);
  const { tried, guard } = useSubmitAttempt();

  if (!model || !offer || !current) {
    return (
      <RosterDialogFrame
        title="Record response"
        description="There is no open renewal offer on this unit."
        onClose={onClose}
        pending={false}
        cancelLabel="Close"
      >
        <p className="text-sm text-content-secondary">Send an offer first, then record the answer here.</p>
      </RosterDialogFrame>
    );
  }

  const isM2M = !current.endDate;
  const errors: Errors = {
    response: response ? null : 'Choose what the resident said.',
    moveOut:
      response !== 'decline'
        ? null
        : !isIsoDate(moveOutOn)
          ? isM2M
            ? 'Enter the move-out date. A month-to-month lease has no end date to default to.'
            : 'Enter the move-out date.'
          : moveOutOn < current.startDate
            ? `Must be on or after the lease start, ${fmtDate(current.startDate)}.`
            : null,
  };
  const ids = { response: 'or-response-0', moveOut: 'or-move-out' };
  const pending = actions.respondToOffer.isPending;
  const unit = `Unit ${model.unit.unitNumber}`;

  async function submit() {
    if (!guard(errors, ids) || !offer || !response) return;
    setServerError(null);
    try {
      if (response === 'decline') {
        await actions.respondToOffer.mutateAsync({ offerId: offer.id, action: 'decline', moveOutOn });
        onDone(`Offer declined. ${unit} is moving out ${fmtDate(moveOutOn)}.`);
      } else if (response === 'accept') {
        await actions.respondToOffer.mutateAsync({ offerId: offer.id, action: 'accept' });
        onDone(`Offer accepted for ${unit}. Record the signed renewal next.`);
      } else {
        await actions.respondToOffer.mutateAsync({ offerId: offer.id, action: 'withdraw' });
        onDone(`Offer for ${unit} withdrawn.`);
      }
    } catch (err) {
      setServerError(describeError(err));
    }
  }

  const options: Array<{ value: Response; label: string; hint: string }> = [
    ...(offer.stage === 'offer_sent'
      ? [{ value: 'accept' as const, label: 'Accepted', hint: 'Then record the signed renewal.' }]
      : []),
    { value: 'decline', label: 'Declined', hint: 'The resident moves out. You can pre-lease the unit.' },
    { value: 'withdraw', label: 'Withdraw offer', hint: 'Cancel the offer. You can send a new one.' },
  ];

  return (
    <RosterDialogFrame
      title={`Record response · ${unit}`}
      description={`${namesOf(model.people)}. ${offer.stage === 'accepted' ? 'The offer was accepted.' : 'The offer is waiting for an answer.'}`}
      onClose={onClose}
      onSubmit={() => void submit()}
      submitLabel={
        response === 'decline' ? 'Record decline' : response === 'withdraw' ? 'Withdraw offer' : 'Record acceptance'
      }
      submitVariant={response === 'withdraw' ? 'destructive' : 'default'}
      pending={pending}
    >
      <ServerErrorBanner error={serverError} />
      <OfferSummary offer={offer} />
      <RadioGroupField<Response>
        name="or-response"
        legend="What did the resident say?"
        options={options}
        value={response}
        onChange={setResponse}
        error={errors.response}
        show={tried}
      />
      {response === 'decline' ? (
        <Field
          id="or-move-out"
          label="Move-out date"
          hint={isM2M ? 'Their last day in the unit.' : 'Defaults to the lease end date.'}
          error={errors.moveOut}
          show={tried}
        >
          <Input
            {...fieldA11y('or-move-out', errors.moveOut, tried, true)}
            type="date"
            min={current.startDate}
            value={moveOutOn}
            onChange={(e) => setMoveOutOn(e.target.value)}
          />
        </Field>
      ) : null}
      {response === 'decline' && isIsoDate(moveOutOn) && moveOutOn < today ? (
        <p className="text-sm text-content-secondary">This date has passed. The lease closes now.</p>
      ) : null}
    </RosterDialogFrame>
  );
}
