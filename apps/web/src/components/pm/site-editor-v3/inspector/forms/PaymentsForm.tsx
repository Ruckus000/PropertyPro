'use client';

import { useCallback } from 'react';
import { paymentsBlockSchema } from '@propertypro/shared';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useUpsertContentBlock } from '@/hooks/use-content-blocks';
import { useBlockForm } from '../use-block-form';
import type { BlockFormProps } from '../types';

const HEADING_MAX = 120;
const BODY_MAX = 600;
const CTA_TEXT_MAX = 40;
const CTA_TARGET_MAX = 512;

interface PaymentsDraft {
  heading: string;
  body: string;
  ctaText: string;
  ctaTarget: string;
}

function toDraft(content: unknown): PaymentsDraft {
  const parsed = paymentsBlockSchema.safeParse(content);
  if (parsed.success) {
    return {
      heading: parsed.data.heading ?? '',
      body: parsed.data.body ?? '',
      ctaText: parsed.data.ctaText ?? '',
      ctaTarget: parsed.data.ctaTarget ?? '',
    };
  }
  const loose = (content ?? {}) as Record<string, unknown>;
  return {
    heading: typeof loose.heading === 'string' ? loose.heading : '',
    body: typeof loose.body === 'string' ? loose.body : '',
    ctaText: typeof loose.ctaText === 'string' ? loose.ctaText : '',
    ctaTarget: typeof loose.ctaTarget === 'string' ? loose.ctaTarget : '',
  };
}

/**
 * Every field is optional — the block renders sensible defaults and resolves
 * its own portal link — so the only way to be unsaveable is to enter a target
 * the schema rejects.
 *
 * That check runs through `paymentsBlockSchema` itself rather than a local
 * URL test, so the form and the server agree by construction: no second
 * validator to drift, and the open-redirect forms `ctaTargetSchema` already
 * refuses (`//evil.com`, `/\evil.com`, `\\evil.com`, `javascript:`, bare
 * `http://`) are refused here too.
 */
function toCanonical(draft: PaymentsDraft): unknown | null {
  const heading = draft.heading.trim();
  const body = draft.body.trim();
  const ctaText = draft.ctaText.trim();
  const ctaTarget = draft.ctaTarget.trim();

  const candidate = {
    ...(heading.length > 0 ? { heading } : {}),
    ...(body.length > 0 ? { body } : {}),
    ...(ctaText.length > 0 ? { ctaText } : {}),
    ...(ctaTarget.length > 0 ? { ctaTarget } : {}),
  };

  return paymentsBlockSchema.safeParse(candidate).success ? candidate : null;
}

export function PaymentsForm({ communityId, blockOrder, content }: BlockFormProps) {
  const upsert = useUpsertContentBlock(communityId);

  const save = useCallback(
    async (next: unknown) => {
      await upsert.mutateAsync({ blockType: 'payments', blockOrder, content: next });
    },
    [upsert, blockOrder],
  );

  const { draft, setDraft, isIncomplete } = useBlockForm<PaymentsDraft>({
    content,
    toDraft,
    toCanonical,
    save,
  });

  const headingId = `payments-heading-${blockOrder}`;
  const bodyId = `payments-body-${blockOrder}`;
  const ctaTextId = `payments-cta-text-${blockOrder}`;
  const ctaTargetId = `payments-cta-target-${blockOrder}`;
  const targetHintId = `${ctaTargetId}-hint`;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={headingId}>Heading</Label>
        <Input
          id={headingId}
          value={draft.heading}
          maxLength={HEADING_MAX}
          placeholder="Pay your assessment"
          onChange={(event) => setDraft((prev) => ({ ...prev, heading: event.target.value }))}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={bodyId}>Description</Label>
        <Textarea
          id={bodyId}
          value={draft.body}
          maxLength={BODY_MAX}
          rows={4}
          placeholder="Optional"
          onChange={(event) => setDraft((prev) => ({ ...prev, body: event.target.value }))}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={ctaTextId}>Button label</Label>
        <Input
          id={ctaTextId}
          value={draft.ctaText}
          maxLength={CTA_TEXT_MAX}
          placeholder="Make a payment"
          onChange={(event) => setDraft((prev) => ({ ...prev, ctaText: event.target.value }))}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={ctaTargetId}>Payment link</Label>
        <Input
          id={ctaTargetId}
          value={draft.ctaTarget}
          maxLength={CTA_TARGET_MAX}
          placeholder="https://yourassociation.clickpay.com"
          aria-describedby={targetHintId}
          onChange={(event) => setDraft((prev) => ({ ...prev, ctaTarget: event.target.value }))}
        />
        <p
          id={targetHintId}
          className={isIncomplete ? 'text-xs text-status-danger' : 'text-xs text-content-secondary'}
        >
          {isIncomplete
            ? 'Enter a full https:// address, or leave this blank to use your resident portal.'
            : 'Leave blank to send residents to your own resident portal. If your association collects through ClickPay, Zego, PayLease or similar, paste that address here instead.'}
        </p>
      </div>

      <p className="rounded-md border border-edge bg-surface-muted p-3 text-xs text-content-secondary">
        This section is a link only. Residents enter card or bank details on the payment
        page it opens, never on your website.
      </p>
    </div>
  );
}
