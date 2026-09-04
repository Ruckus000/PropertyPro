'use client';

/**
 * One request in the table, and its signers when opened.
 *
 * The Document cell holds a disclosure AND a link, which is why the
 * whole-row-`<button>` pattern used elsewhere in the app cannot be copied here:
 * an `<a>` may not descend from a `<button>`, and browsers "fix" it by hoisting
 * the link out of the button in the parsed tree, so the focus order stops
 * matching the paint. Two siblings instead — the chevron discloses, the title
 * navigates.
 *
 * The row itself has no `onClick`. The list this replaces put one on a bare
 * `<tr>` with no role, no `tabIndex` and no key handler, which meant no
 * keyboard user could open a submission at all.
 */

import { Fragment, useCallback, type KeyboardEvent, type RefObject } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronRight, Clock } from 'lucide-react';
import { Badge } from '@propertypro/ui';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { formatShortDate } from '@/lib/utils/format-date';
import {
  describeExpiry,
  requestTitle,
  signatureProgress,
  templateLabel,
  type EsignRequest,
  type ExpiryTone,
} from '@/lib/esign/submission-status';
import { esignStatusDisplay } from './esign-status-config';
import { SignerRow } from './signer-row';

/**
 * Fully spelled, never assembled. `guard:class-resolution` fails on
 * `` `text-status-${tone}` ``, and Tailwind would emit nothing for it anyway.
 * Neutral is `content-secondary` rather than `status-neutral` on purpose: "in
 * 40 days" is ordinary metadata, not a status.
 */
const EXPIRY_TONE: Record<ExpiryTone, string> = {
  neutral: 'text-content-secondary',
  warning: 'text-status-warning',
  danger: 'text-status-danger',
};

const EXPIRY_ICON: Record<ExpiryTone, typeof Clock | null> = {
  neutral: null,
  warning: Clock,
  danger: AlertTriangle,
};

export interface RequestRowProps {
  communityId: number;
  request: EsignRequest;
  now: Date;
  isExpanded: boolean;
  onToggle: () => void;
  /** Column count, shared with the header so `colSpan` cannot drift. */
  columnCount: number;
  /** Attached only to the open row, so Escape has one place to return focus. */
  disclosureRef?: RefObject<HTMLButtonElement | null>;
  onCollapse: () => void;
}

export function RequestRow({
  communityId,
  request,
  now,
  isExpanded,
  onToggle,
  columnCount,
  disclosureRef,
  onCollapse,
}: RequestRowProps) {
  const title = requestTitle(request);
  const progress = signatureProgress(request);
  const expiry = describeExpiry(request.expiresAt, now);
  const status = esignStatusDisplay(request.effectiveStatus);
  const StatusIcon = status.icon;
  const ExpiryIcon = expiry ? EXPIRY_ICON[expiry.tone] : null;
  const panelId = `esign-request-${request.id}-signers`;

  const handlePanelKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTableCellElement>) => {
      if (event.key !== 'Escape') return;
      // A dialog opened from inside the panel handles Escape itself and marks
      // the event handled; without this one Escape would close the dialog AND
      // collapse the row underneath it.
      if (event.defaultPrevented) return;
      event.stopPropagation();
      onCollapse();
    },
    [onCollapse],
  );

  return (
    <Fragment>
      <tr
        className={cn(
          'border-b border-edge-subtle align-top',
          isExpanded && 'border-b-0 bg-surface-subtle',
        )}
      >
        <td className="px-3 py-3">
          <div className="flex items-start gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 shrink-0 md:size-9"
              aria-expanded={isExpanded}
              // Conditional, never constant: a `aria-controls` pointing at an
              // id that only exists while open is a dangling reference the rest
              // of the time, which axe flags and assistive tech cannot resolve.
              aria-controls={isExpanded ? panelId : undefined}
              // The title is what tells twenty identical chevrons apart.
              aria-label={`Signers for ${title}`}
              ref={disclosureRef}
              onClick={onToggle}
            >
              <ChevronRight
                aria-hidden="true"
                className={cn(
                  'size-4 transition-transform duration-quick motion-reduce:transition-none',
                  isExpanded && 'rotate-90',
                )}
              />
            </Button>

            <div className="min-w-0 flex-1">
              <Link
                href={`/esign/submissions/${request.id}?communityId=${communityId}`}
                className="block truncate font-medium text-content hover:text-content-link hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
              >
                {title}
              </Link>
              <p className="truncate text-sm text-content-secondary">
                {templateLabel(request)} · sent {formatShortDate(request.createdAt)}
              </p>
              <p className="truncate text-sm text-content-tertiary">
                {progress.signed} of {progress.total} signed ·{' '}
                {request.signingOrder === 'sequential' ? 'In order' : 'All at once'}
                {/* Folded in below md, where the Expires column is hidden. */}
                {expiry ? <span className="md:hidden"> · {expiry.label}</span> : null}
              </p>
            </div>
          </div>
        </td>

        <td className="px-3 py-3">
          {/* The bar is decoration; the text beside it is the accessible value. */}
          <div
            aria-hidden="true"
            className="mb-1 h-1.5 w-full max-w-24 overflow-hidden rounded-full bg-surface-muted"
          >
            <div
              className={cn(
                'h-full rounded-full',
                progress.percent === 100 ? 'bg-status-success' : 'bg-interactive',
              )}
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <span className="text-sm tabular-nums text-content-secondary">
            {progress.signed} of {progress.total}
          </span>
        </td>

        <td className="hidden px-3 py-3 md:table-cell">
          {expiry ? (
            <span className={cn('inline-flex items-center gap-1.5 text-sm', EXPIRY_TONE[expiry.tone])}>
              {ExpiryIcon ? <ExpiryIcon aria-hidden="true" className="size-3.5" /> : null}
              {expiry.label}
            </span>
          ) : (
            <span className="text-sm text-content-tertiary">Does not expire</span>
          )}
        </td>

        <td className="px-3 py-3">
          <Badge variant={status.variant} size="sm">
            <Badge.Icon>
              <StatusIcon className="size-3" />
            </Badge.Icon>
            <Badge.Label>{status.label}</Badge.Label>
          </Badge>
        </td>
      </tr>

      {isExpanded ? (
        <tr className="border-b border-edge-subtle bg-surface-subtle">
          <td
            id={panelId}
            colSpan={columnCount}
            className="px-3 pb-4 pt-0"
            onKeyDown={handlePanelKeyDown}
          >
            {/*
              `group`, not `region`: a landmark nested inside a table is worse
              than the problem it solves. The name matters because a spanning
              cell is associated with every column header, so without it a
              screen reader prefixes the panel with the whole header row.
            */}
            <div role="group" aria-label={`Signers for ${title}`}>
              <ul className="divide-y divide-edge-subtle">
                {request.signers.map((signer) => (
                  <SignerRow
                    key={signer.id}
                    communityId={communityId}
                    request={request}
                    signer={signer}
                  />
                ))}
              </ul>
            </div>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}
