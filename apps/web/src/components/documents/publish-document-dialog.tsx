'use client';

/**
 * The review step in front of putting a document on the association's public
 * site — §718.111(12)(g).
 *
 * This is a deliberate interstitial, not a confirmation reflex. Publishing is
 * the one action on this screen that changes what an association is showing the
 * open internet, and it is the point at which Fla. Stat. 718.111(12)(c)'s
 * redaction duty actually bites: the attestation taken at upload covers the
 * owner portal, and only for categories that USUALLY carry PII.
 *
 * The attestation shown here mirrors the server's rule exactly — same helper,
 * same fail-closed treatment of an unrecognised category — so the checkbox
 * appears in precisely the cases the API will refuse without it.
 *
 * Removing a document takes no attestation: it reduces disclosure.
 */

import { useEffect, useId, useState } from 'react';
import { isRedactionSensitiveCategory, normalizeCategoryName } from '@propertypro/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { REDACTION_ATTESTATION_TEXT } from '@/lib/documents/redaction-attestation-text';

interface PublishDocumentDialogProps {
  open: boolean;
  /** true = putting it on the public site; false = taking it off. */
  publishing: boolean;
  documentTitle: string;
  categoryName: string | null;
  requirementTitle: string | null;
  isPending: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: (redactionAttested: boolean | undefined) => void;
}

export function PublishDocumentDialog({
  open,
  publishing,
  documentTitle,
  categoryName,
  requirementTitle,
  isPending,
  errorMessage,
  onCancel,
  onConfirm,
}: PublishDocumentDialogProps) {
  const [attested, setAttested] = useState(false);
  const checkboxId = useId();

  // Reopening for another document must not inherit the previous tick.
  useEffect(() => {
    if (open) setAttested(false);
  }, [open, documentTitle]);

  const requiresAttestation =
    publishing && isRedactionSensitiveCategory(normalizeCategoryName(categoryName ?? null));

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            {publishing ? 'Put this document on the public site?' : 'Remove from the public site?'}
          </DialogTitle>
          <DialogDescription>
            {publishing
              ? 'Anyone will be able to read and download it from your association’s website, without signing in.'
              : 'It will stay in the library for residents, but will no longer appear on your association’s website.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border border-edge bg-surface-subtle p-3">
            <p className="text-sm font-medium text-content">{documentTitle}</p>
            {categoryName && (
              <p className="text-xs capitalize text-content-secondary">{categoryName}</p>
            )}
            {requirementTitle && (
              <p className="mt-1 text-xs text-content-secondary">
                Satisfies: {requirementTitle}
              </p>
            )}
          </div>

          {requiresAttestation && (
            <label
              htmlFor={checkboxId}
              className="flex cursor-pointer items-start gap-2 rounded-md border border-status-warning-border bg-status-warning-bg p-3"
            >
              <input
                id={checkboxId}
                type="checkbox"
                checked={attested}
                onChange={(event) => setAttested(event.target.checked)}
                className="mt-0.5 size-4 rounded border-edge-strong"
              />
              <span className="text-xs leading-relaxed text-content">
                {REDACTION_ATTESTATION_TEXT} Documents in this category commonly contain
                protected personal information.
              </span>
            </label>
          )}

          {errorMessage && (
            <p role="alert" className="text-sm text-status-danger">
              {errorMessage}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(requiresAttestation ? attested : undefined)}
            disabled={requiresAttestation && !attested}
            loading={isPending}
          >
            {publishing ? 'Put on public site' : 'Remove from public site'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
