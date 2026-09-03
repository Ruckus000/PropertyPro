'use client';

/**
 * Step 2 — who signs.
 *
 * The same step in both modes, asking the question each one can actually
 * answer. A send names people: this request goes to Alice and Bob. A template
 * names roles: whoever the owner turns out to be, and whoever witnesses. The
 * mode's own settings ride along here rather than getting a step of their own,
 * because neither set is large enough to stop for.
 */

import { Plus, Trash2 } from 'lucide-react';
import {
  ESIGN_TEMPLATE_TYPES,
  type EsignSigningOrder,
  type EsignTemplateType,
} from '@propertypro/shared';
import { cn } from '@/lib/utils';
import { ESIGN_FIELD_COLORS } from '@/components/esign/esign-field-colors';
import {
  MAX_RECIPIENTS,
  type BuilderRecipient,
  type BuilderState,
} from '@/lib/esign/builder-state';

const TYPE_LABELS: Record<EsignTemplateType, string> = {
  proxy: 'Proxy',
  consent: 'Consent',
  lease_addendum: 'Lease addendum',
  maintenance_auth: 'Maintenance authorisation',
  violation_ack: 'Violation acknowledgment',
  assessment_agreement: 'Assessment agreement',
  custom: 'Custom',
};

const inputClass =
  'w-full rounded-md border border-edge bg-surface-card px-3 py-2 text-sm text-content ' +
  'placeholder:text-content-placeholder focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-interactive';

const labelClass = 'mb-1 block text-sm font-medium text-content';

export interface StepRecipientsProps {
  state: BuilderState;
  onChange: (next: BuilderState) => void;
  onAdd: () => void;
  onRemove: (recipientId: string) => void;
  onUpdate: (recipientId: string, patch: Partial<Omit<BuilderRecipient, 'id'>>) => void;
}

export function StepRecipients({
  state,
  onChange,
  onAdd,
  onRemove,
  onUpdate,
}: StepRecipientsProps) {
  const isTemplate = state.mode === 'template';

  return (
    <div className="space-y-6">
      {isTemplate && (
        <section className="space-y-4 rounded-lg border border-edge-subtle bg-surface-card p-6">
          <h2 className="text-base font-semibold text-content">About this template</h2>

          <div>
            <label className={labelClass} htmlFor="builder-template-name">
              Name <span className="text-status-danger">*</span>
            </label>
            <input
              id="builder-template-name"
              className={inputClass}
              value={state.templateName}
              placeholder="Limited proxy"
              onChange={(e) => onChange({ ...state, templateName: e.target.value })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="builder-template-type">
                Type
              </label>
              <select
                id="builder-template-type"
                className={inputClass}
                value={state.templateType}
                onChange={(e) =>
                  onChange({ ...state, templateType: e.target.value as EsignTemplateType })
                }
              >
                {ESIGN_TEMPLATE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass} htmlFor="builder-template-description">
                Description
              </label>
              <input
                id="builder-template-description"
                className={inputClass}
                value={state.templateDescription}
                placeholder="When to use it"
                onChange={(e) => onChange({ ...state, templateDescription: e.target.value })}
              />
            </div>
          </div>
        </section>
      )}

      <section className="space-y-4 rounded-lg border border-edge-subtle bg-surface-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-content">
            {isTemplate ? 'Signer roles' : 'Recipients'}
          </h2>
          <span className="text-xs text-content-tertiary tabular-nums">
            {state.recipients.length} of {MAX_RECIPIENTS}
          </span>
        </div>

        <p className="text-sm text-content-secondary">
          {isTemplate
            ? 'Name the parts people play. Whoever is sent this template is matched to one of them.'
            : 'Each person gets their own link, and only the fields you give them.'}
        </p>

        <ul className="space-y-3">
          {state.recipients.map((recipient, index) => (
            <li
              key={recipient.id}
              className="rounded-md border border-edge-subtle bg-surface-page p-4"
            >
              <div className="mb-3 flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      ESIGN_FIELD_COLORS[index % ESIGN_FIELD_COLORS.length] as string,
                  }}
                />
                <span className="text-sm font-medium text-content">
                  {isTemplate ? `Role ${index + 1}` : `Recipient ${index + 1}`}
                </span>
                {state.recipients.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemove(recipient.id)}
                    className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-content-secondary transition-colors hover:text-status-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Remove
                  </button>
                )}
              </div>

              <div className={cn('grid gap-3', isTemplate ? '' : 'sm:grid-cols-3')}>
                {!isTemplate && (
                  <>
                    <div>
                      <label className={labelClass} htmlFor={`recipient-name-${recipient.id}`}>
                        Name <span className="text-status-danger">*</span>
                      </label>
                      <input
                        id={`recipient-name-${recipient.id}`}
                        className={inputClass}
                        value={recipient.name}
                        placeholder="Alice Alvarez"
                        onChange={(e) => onUpdate(recipient.id, { name: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor={`recipient-email-${recipient.id}`}>
                        Email <span className="text-status-danger">*</span>
                      </label>
                      <input
                        id={`recipient-email-${recipient.id}`}
                        type="email"
                        className={inputClass}
                        value={recipient.email}
                        placeholder="alice@example.com"
                        onChange={(e) => onUpdate(recipient.id, { email: e.target.value })}
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className={labelClass} htmlFor={`recipient-role-${recipient.id}`}>
                    Role <span className="text-status-danger">*</span>
                  </label>
                  <input
                    id={`recipient-role-${recipient.id}`}
                    className={inputClass}
                    value={recipient.role}
                    placeholder="owner"
                    onChange={(e) => onUpdate(recipient.id, { role: e.target.value })}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>

        {state.recipients.length < MAX_RECIPIENTS && (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-2 rounded-md border border-edge px-3 py-2 text-sm font-medium text-content transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
          >
            <Plus className="size-4" aria-hidden="true" />
            {isTemplate ? 'Add a role' : 'Add a recipient'}
          </button>
        )}
      </section>

      {!isTemplate && (
        <section className="space-y-4 rounded-lg border border-edge-subtle bg-surface-card p-6">
          <h2 className="text-base font-semibold text-content">How it goes out</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="builder-signing-order">
                Order
              </label>
              <select
                id="builder-signing-order"
                className={inputClass}
                value={state.signingOrder}
                onChange={(e) =>
                  onChange({ ...state, signingOrder: e.target.value as EsignSigningOrder })
                }
              >
                <option value="parallel">Everyone at once</option>
                <option value="sequential">One after another, in order</option>
              </select>
            </div>

            <div>
              <label className={labelClass} htmlFor="builder-expiry">
                Expires after
              </label>
              <select
                id="builder-expiry"
                className={inputClass}
                value={String(state.expiryDays)}
                onChange={(e) => onChange({ ...state, expiryDays: Number(e.target.value) })}
              >
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
                <option value="0">Does not expire</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="builder-subject">
              Email subject
            </label>
            <input
              id="builder-subject"
              className={inputClass}
              value={state.messageSubject}
              placeholder="Leave blank to use the document name"
              onChange={(e) => onChange({ ...state, messageSubject: e.target.value })}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="builder-message">
              Message
            </label>
            <textarea
              id="builder-message"
              rows={3}
              className={inputClass}
              value={state.messageBody}
              placeholder="Anything the signers should know first"
              onChange={(e) => onChange({ ...state, messageBody: e.target.value })}
            />
          </div>

          <label className="flex items-start gap-3 text-sm text-content">
            <input
              type="checkbox"
              checked={state.sendEmail}
              onChange={(e) => onChange({ ...state, sendEmail: e.target.checked })}
              className="mt-0.5 size-4 rounded border-edge focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
            />
            <span>
              Email each recipient their link
              <span className="mt-0.5 block text-content-secondary">
                Leave this off to copy the links yourself from the request.
              </span>
            </span>
          </label>
        </section>
      )}
    </div>
  );
}
