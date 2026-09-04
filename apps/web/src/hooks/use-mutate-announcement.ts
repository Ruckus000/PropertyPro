'use client';

import { useMutation } from '@tanstack/react-query';

/**
 * Create-or-update an announcement.
 *
 * Single user-triggered `POST /api/v1/announcements`. The endpoint creates by
 * default and updates when the payload carries `action: 'update'` + `id`
 * (see apps/web/src/app/api/v1/announcements/route.ts POST handler).
 *
 * B5 (ADR-003) drain: moves the network call out of
 * `announcement-authoring-form.tsx`. All `router.*` navigation and the
 * cancel/back path stay in the component (UI side-effects).
 */

export interface MutateAnnouncementPayload {
  communityId: number;
  title: string;
  body: string;
  audience: 'all' | 'owners_only' | 'board_only' | 'tenants_only';
  isPinned: boolean;
  /**
   * ISO-8601 instant at which the announcement stops showing, or null for no
   * expiry. Declared because the composer spreads it into this payload — a
   * spread skips excess-property checks, so without this the field reached the
   * wire while the type denied it existed, and a rename would not have failed
   * to compile.
   */
  expiresAt?: string | null;
  /** Present only on the update path. */
  action?: 'update';
  /** Present only on the update path. */
  id?: number;
}

export interface MutateAnnouncementResult {
  data?: { id?: number };
}

// Documented exception to the requestJson rule: the component renders the
// server's parsed error message verbatim (errorBody.error.message ?? message)
// and depends on the exact create/update fallback wording, so we replicate the
// component's original error-body parsing byte-for-byte rather than delegating
// to requestJson's generic error envelope.
async function readErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  const errorBody = (await response.json().catch(() => null)) as
    | { message?: string; error?: { message?: string } }
    | null;

  return errorBody?.error?.message ?? errorBody?.message ?? fallbackMessage;
}

async function mutateAnnouncement(
  payload: MutateAnnouncementPayload,
): Promise<MutateAnnouncementResult> {
  const isUpdate = payload.action === 'update';

  const response = await fetch('/api/v1/announcements', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        isUpdate
          ? 'We could not update this announcement.'
          : 'We could not create this announcement.',
      ),
    );
  }

  return (await response.json()) as MutateAnnouncementResult;
}

export function useMutateAnnouncement() {
  return useMutation({
    mutationFn: mutateAnnouncement,
  });
}
