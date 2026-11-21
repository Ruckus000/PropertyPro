'use client';

/**
 * Generate charges for a One-Time assessment.
 *
 * The monthly run (generate-assessments cron) skips One-Time assessments, so
 * until this existed nothing in the app ever charged one. The manager picks the
 * due date, confirms, and every unit in the Directory gets one charge
 * (POST /api/v1/assessments/[id]/generate). The service charges each unit at
 * most once per One-Time assessment, whatever date a later run picks, and the
 * line-items panel only mounts this while the assessment has no charges.
 *
 * "Today" is the community's, not the browser's: the server refuses a due date
 * before it, and the overdue cron judges late by the same clock.
 */

import { useId, useRef, useState, type FormEvent } from 'react';
import dynamic from 'next/dynamic';
import { AlertBanner } from '@/components/shared/alert-banner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useGenerateAssessmentLineItems, type Assessment } from '@/hooks/use-finance';
import { ApiRequestError } from '@/lib/api/request-json';
import { formatDateOnly } from '@/lib/utils/format-date';
import { dateOnlyInTimeZone } from '@/lib/utils/zoned-datetime';

// Mounted only once Generate charges is pressed.
const ConfirmDialog = dynamic(
  () => import('@/components/pm/site-editor-v3/ConfirmDialog').then((m) => m.ConfirmDialog),
  { ssr: false },
);

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

/**
 * A refusal (4xx) happens before anything is written, so its reason can be
 * shown as is. Anything else may have failed after the charges were saved.
 */
function describeFailure(err: unknown): { title: string; description: string } {
  if (err instanceof ApiRequestError && err.status === 401) {
    return {
      title: 'No charges were created',
      description: 'Your session has ended. Sign in again, then generate the charges.',
    };
  }
  if (err instanceof ApiRequestError && err.status < 500) {
    return { title: 'No charges were created', description: err.message };
  }
  return {
    title: 'We couldn’t confirm the charges',
    description: 'Check your connection, then try again. A unit that already has this charge isn’t charged twice.',
  };
}

interface OneTimeChargesProps {
  communityId: number;
  assessment: Assessment;
  /** The community's IANA time zone. */
  timeZone: string;
  /** Called once the charges exist; this form is about to unmount, so the parent takes focus. */
  onCharged?: () => void;
}

export function OneTimeCharges({ communityId, assessment, timeZone, onCharged }: OneTimeChargesProps) {
  const [dueDate, setDueDate] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<{ title: string; description: string } | null>(null);
  const submitButton = useRef<HTMLButtonElement | null>(null);
  const generate = useGenerateAssessmentLineItems(communityId, assessment.id);
  const id = useId();
  const dateId = `${id}-due`;
  const errorId = `${id}-due-error`;
  const today = dateOnlyInTimeZone(new Date(), timeZone);

  if (!assessment.isActive) {
    return (
      <p className="py-4 text-center text-sm text-content-tertiary">
        This assessment is inactive. To charge it, select Edit and turn on Active.
      </p>
    );
  }

  function review(event: FormEvent) {
    event.preventDefault();
    if (!dueDate) {
      setFieldError('Choose a due date.');
      return;
    }
    if (dueDate < today) {
      setFieldError('Choose today or a later date.');
      return;
    }
    setFieldError(null);
    setError(null);
    setConfirming(true);
  }

  async function confirm() {
    try {
      // On success the line items reload and this panel gives way to them.
      await generate.mutateAsync(dueDate);
      onCharged?.();
    } catch (err) {
      setError(describeFailure(err));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <AlertBanner status="danger" title={error.title} description={error.description} />}
      <p className="text-sm text-content-secondary">
        One-Time assessments are not charged automatically. Choose when it is due, and every unit in your
        Directory is charged {formatCents(assessment.amountCents)} once.
      </p>
      <form onSubmit={review} noValidate className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor={dateId}>Due date</Label>
          <Input
            id={dateId}
            type="date"
            min={today}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? errorId : undefined}
            className="w-auto md:w-auto"
          />
        </div>
        <Button ref={submitButton} type="submit" disabled={generate.isPending}>
          Generate charges
        </Button>
      </form>
      {fieldError && (
        <p id={errorId} className="text-sm text-status-danger">
          {fieldError}
        </p>
      )}
      {confirming && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirming(false);
          }}
          restoreFocusTo={submitButton}
          title={`Charge every unit ${formatCents(assessment.amountCents)}?`}
          description={`Each unit in your Directory is charged ${formatCents(assessment.amountCents)} for ${assessment.title}, due ${formatDateOnly(dueDate)}. Charges can’t be removed in PropertyPro once they’re created.`}
          confirmLabel="Generate charges"
          cancelLabel="Go back"
          pending={generate.isPending}
          onConfirm={() => void confirm()}
        />
      )}
    </div>
  );
}
