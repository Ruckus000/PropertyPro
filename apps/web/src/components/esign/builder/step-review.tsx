'use client';

/**
 * Step 4 — what is about to happen.
 *
 * The last screen before something leaves the building, so it says the things
 * that are hard to undo: who gets it, what they have to fill in, whether an
 * email goes out, and when it stops working.
 */

import { FileText, Mail, MailX } from 'lucide-react';
import { ESIGN_FIELD_COLORS } from '@/components/esign/esign-field-colors';
import { fieldsForRecipient, type BuilderState } from '@/lib/esign/builder-state';

export interface StepReviewProps {
  state: BuilderState;
}

function expiryLabel(days: number): string {
  if (days <= 0) return 'Does not expire';
  return `${days} day${days === 1 ? '' : 's'} from now`;
}

export function StepReview({ state }: StepReviewProps) {
  const isTemplate = state.mode === 'template';

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-edge-subtle bg-surface-card p-6">
        <h2 className="mb-4 text-base font-semibold text-content">
          {isTemplate ? 'Template' : 'Document'}
        </h2>
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 size-5 shrink-0 text-content-tertiary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-content">
              {isTemplate ? state.templateName || 'Untitled template' : state.document?.name}
            </p>
            <p className="mt-1 text-sm text-content-secondary">
              {isTemplate ? state.document?.name : `${state.fields.length} fields placed`}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-edge-subtle bg-surface-card p-6">
        <h2 className="mb-4 text-base font-semibold text-content">
          {isTemplate ? 'Signer roles' : 'Recipients'}
        </h2>
        <ul className="divide-y divide-edge-subtle">
          {state.recipients.map((recipient, index) => {
            const count = fieldsForRecipient(state, recipient.id).length;
            return (
              <li key={recipient.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      ESIGN_FIELD_COLORS[index % ESIGN_FIELD_COLORS.length] as string,
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-content">
                    {isTemplate ? recipient.role : recipient.name}
                  </p>
                  {!isTemplate && (
                    <p className="truncate text-sm text-content-secondary">
                      {recipient.email} · {recipient.role}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-sm tabular-nums text-content-secondary">
                  {count} field{count === 1 ? '' : 's'}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {!isTemplate && (
        <section className="rounded-lg border border-edge-subtle bg-surface-card p-6">
          <h2 className="mb-4 text-base font-semibold text-content">Delivery</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-content-secondary">Order</dt>
              <dd className="text-content">
                {state.signingOrder === 'sequential'
                  ? 'One after another, in order'
                  : 'Everyone at once'}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-content-secondary">Expires</dt>
              <dd className="text-content">{expiryLabel(state.expiryDays)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-content-secondary">Email</dt>
              <dd className="inline-flex items-center gap-2 text-content">
                {state.sendEmail ? (
                  <>
                    <Mail className="size-4 text-content-tertiary" aria-hidden="true" />
                    Sent to each recipient
                  </>
                ) : (
                  <>
                    <MailX className="size-4 text-content-tertiary" aria-hidden="true" />
                    Not sent — copy the links yourself
                  </>
                )}
              </dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}
