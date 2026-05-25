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
    // As of B1 Slice 3, this route returns the canonical
    // `{ data: { results } }` envelope. The hook unwraps `.data` manually
    // rather than adopting `requestJson` so the bespoke fallback literal
    // 'Failed to send bulk announcement' (used on both unparseable bodies
    // and 200 success bodies missing the `results` field) stays preserved
    // — migration to `requestJson` is B6 work.
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
        data?: { results?: BulkAnnouncementResult[] };
      } | null;

      if (!res.ok) {
        throw new Error(
          json?.error?.message ?? 'Failed to send bulk announcement',
        );
      }

      // A 200 whose body is unparseable or missing `data.results` is an API
      // error, not an empty success — surface it (matches the original
      // inline mutation, which threw on a bad success body) instead of
      // showing a misleading "Sent to 0/0".
      if (!json?.data?.results) {
        throw new Error('Failed to send bulk announcement');
      }

      return { results: json.data.results };
    },
  });
}
