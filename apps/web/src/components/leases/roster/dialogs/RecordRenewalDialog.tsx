'use client';

/**
 * Record a signed renewal: confirms the accepted offer's terms and signs it,
 * which creates the renewal lease. The current lease is not touched; the new
 * term takes over on its start date.
 */
import { useState } from 'react';
import { newIdempotencyKey } from '@/hooks/use-lease-roster';
import type { RosterDialogProps } from '../types';
import {
  NoticeDaysField,
  RosterDialogFrame,
  ServerErrorBanner,
  describeError,
  fmtDate,
  namesOf,
  noticeDaysError,
  useSubmitAttempt,
  type Errors,
  type ServerErrorView,
} from './form-kit';
import { OfferSummary } from './OfferResponseDialog';

export function RecordRenewalDialog(props: RosterDialogProps) {
  const { model, actions, onDone, onClose } = props;
  const offer = model?.offer && (model.offer.stage === 'accepted' || model.offer.stage === 'offer_sent') ? model.offer : null;
  const current = model?.current ?? null;

  const [idempotencyKey] = useState(newIdempotencyKey);
  const [noticeDays, setNoticeDays] = useState(String(current?.noticeDays ?? 60));
  const [serverError, setServerError] = useState<ServerErrorView | null>(null);
  const { tried, guard } = useSubmitAttempt();

  if (!model || !offer || !current) {
    return (
      <RosterDialogFrame
        title="Record renewal"
        description="There is no accepted offer on this unit."
        onClose={onClose}
        pending={false}
        cancelLabel="Close"
      >
        <p className="text-sm text-content-secondary">Record the resident’s acceptance first.</p>
      </RosterDialogFrame>
    );
  }

  const hasEnd = !!(offer.termMonths || offer.customEndDate);
  const errors: Errors = { noticeDays: hasEnd ? noticeDaysError(noticeDays) : null };
  const pending = actions.respondToOffer.isPending;

  async function submit() {
    if (!guard(errors, { noticeDays: 'rr-notice-days' }) || !offer || !model) return;
    setServerError(null);
    try {
      await actions.respondToOffer.mutateAsync({
        offerId: offer.id,
        action: 'sign',
        noticeDays: hasEnd ? Number(noticeDays) : null,
        idempotencyKey,
      });
      onDone(`Renewal recorded for Unit ${model.unit.unitNumber}. The new term starts ${fmtDate(offer.startDate)}.`);
    } catch (err) {
      setServerError(describeError(err));
    }
  }

  return (
    <RosterDialogFrame
      title={`Record renewal · Unit ${model.unit.unitNumber}`}
      description={`${namesOf(model.people)} signed the renewal. Check the terms before you record it.`}
      onClose={onClose}
      onSubmit={() => void submit()}
      submitLabel="Record renewal"
      pending={pending}
    >
      <ServerErrorBanner error={serverError} />
      <OfferSummary offer={offer} />
      <p className="text-sm text-content">
        The new term starts {fmtDate(offer.startDate)}. The current lease stays as it is until then
        {current.endDate ? `, ending ${fmtDate(current.endDate)}` : ''}.
      </p>
      {hasEnd ? (
        <NoticeDaysField
          id="rr-notice-days"
          value={noticeDays}
          onChange={setNoticeDays}
          error={errors.noticeDays ?? null}
          show={tried}
        />
      ) : null}
    </RosterDialogFrame>
  );
}
