'use client';

/**
 * Post a draft, or take a posted document back to a draft.
 *
 * Posting is the moment owners first see the document, so it asks the upload's
 * redaction question (by category, as `POST /api/v1/documents` does). Taking a
 * document back says what owners lose — including, when it is the file behind a
 * statutory requirement, that it is unlinked from it and must be linked again.
 */

import { useState } from 'react';
import { EyeOff, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useDocumentCategories } from '@/hooks/use-document-categories';
import { useSetDocumentPosted } from '@/hooks/use-documents';
import { isDraft, type ChecklistRow, type DocumentRow } from '@/lib/documents/document-state';
import {
  RedactionAttestationField,
  categoryRequiresRedactionAttestation,
} from './redaction-attestation-field';

interface DocumentPostingControlProps {
  communityId: number;
  document: DocumentRow;
  /** The requirement this file is the record for, if any. */
  requirement: ChecklistRow | null;
}

/** The confirmation shown before a posted document goes back to a draft. */
export function unpostConfirmation(document: DocumentRow, requirement: ChecklistRow | null): string {
  const parts = [
    `Take “${document.title}” off your site? It’s kept as a draft, and owners can’t see it until you post it again.`,
  ];
  if (document.publicAccess === true) {
    parts.push('It also comes off the public website.');
  }
  if (requirement) {
    parts.push(
      `It is the record for “${requirement.title}”. That requirement will show as missing, and you’ll need to link the document again after you post it.`,
    );
  }
  return parts.join(' ');
}

export function DocumentPostingControl({ communityId, document, requirement }: DocumentPostingControlProps) {
  const mutation = useSetDocumentPosted(communityId);
  const { categories } = useDocumentCategories(communityId);
  const [asking, setAsking] = useState(false);
  const [attested, setAttested] = useState(false);

  const categoryName = categories.find((c) => c.id === document.categoryId)?.name ?? null;
  const requiresAttestation = categoryRequiresRedactionAttestation(categoryName);
  const draft = isDraft(document);

  const post = async () => {
    try {
      await mutation.mutateAsync({
        id: document.id,
        posted: true,
        ...(requiresAttestation ? { redactionAttested: attested } : {}),
      });
      toast.success('Posted. Owners can see it now.');
      setAsking(false);
      setAttested(false);
    } catch {
      // Surfaced below via the mutation's error state.
    }
  };

  const unpost = async () => {
    if (typeof window !== 'undefined' && !window.confirm(unpostConfirmation(document, requirement))) {
      return;
    }
    try {
      await mutation.mutateAsync({ id: document.id, posted: false });
      toast.success('Taken off your site. It’s kept as a draft.');
    } catch {
      // Surfaced below via the mutation's error state.
    }
  };

  const error = mutation.error instanceof Error ? mutation.error.message : null;

  if (!draft) {
    return (
      <>
        <Button variant="outline" size="sm" onClick={() => void unpost()} loading={mutation.isPending}>
          <EyeOff className="size-4" aria-hidden="true" />
          Take off the site
        </Button>
        {error && (
          <p role="alert" className="w-full text-sm text-status-danger">
            {error}
          </p>
        )}
      </>
    );
  }

  return (
    <div className="w-full space-y-3 rounded-md border border-status-warning-border bg-status-warning-bg p-3">
      <p className="text-sm text-content">
        <span className="font-medium">Draft.</span> Owners can’t see this document until you post it.
      </p>

      {asking && requiresAttestation && (
        <RedactionAttestationField
          id={`document-post-redaction-${document.id}`}
          checked={attested}
          onChange={setAttested}
          disabled={mutation.isPending}
        />
      )}

      {error && (
        <p role="alert" className="text-sm text-status-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          loading={mutation.isPending}
          disabled={asking && requiresAttestation && !attested}
          onClick={() => {
            if (requiresAttestation && !asking) {
              setAsking(true);
              return;
            }
            void post();
          }}
        >
          <Send className="size-4" aria-hidden="true" />
          Post now
        </Button>
        {asking && (
          <Button
            variant="ghost"
            size="sm"
            disabled={mutation.isPending}
            onClick={() => {
              setAsking(false);
              setAttested(false);
            }}
          >
            Not yet
          </Button>
        )}
      </div>
    </div>
  );
}
