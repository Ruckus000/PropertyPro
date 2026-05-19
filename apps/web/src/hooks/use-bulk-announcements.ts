'use client';

import { useMutation } from '@tanstack/react-query';

export type BulkAnnouncementAudience =
  | 'all'
  | 'owners_only'
  | 'board_only'
  | 'tenants_only';

export interface BulkAnnouncementInput {
  communityIds: number[];
  title: string;
  body: string;
  audience: BulkAnnouncementAudience;
  isPinned: boolean;
}

export interface BulkAnnouncementResult {
  communityId: number;
  communityName: string;
  status: 'sent' | 'failed';
  error?: string;
}

export interface BulkAnnouncementResponse {
  results: BulkAnnouncementResult[];
}

/**
 * Send an announcement to multiple communities at once.
 *
 * Mutation-only flow: there is no cached PM bulk query, so nothing to
 * invalidate on success.
 */
export function useBulkAnnouncements() {
  return useMutation<BulkAnnouncementResponse, Error, BulkAnnouncementInput>({
    // Documented exception to the requestJson rule: POST
    // /api/v1/pm/bulk/announcements returns a flat `{ results }` envelope
    // (no `{ data }` wrapper), so requestJson's `.data` unwrap does not fit.
    mutationFn: async (input) => {
      const res = await fetch('/api/v1/pm/bulk/announcements', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityIds: input.communityIds,
          title: input.title,
          body: input.body,
          audience: input.audience,
          isPinned: input.isPinned,
        }),
      });

      const json = (await res.json().catch(() => null)) as {
        error?: { message?: string };
        results?: BulkAnnouncementResult[];
      } | null;

      if (!res.ok) {
        throw new Error(
          json?.error?.message ?? 'Failed to send bulk announcement',
        );
      }

      // A 200 whose body is unparseable or missing `results` is an API
      // error, not an empty success — surface it (matches the original
      // inline mutation, which threw on a bad success body) instead of
      // showing a misleading "Sent to 0/0".
      if (!json?.results) {
        throw new Error('Failed to send bulk announcement');
      }

      return { results: json.results };
    },
  });
}
