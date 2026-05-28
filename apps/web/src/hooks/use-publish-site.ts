'use client';

/**
 * React Query hook for the PR #8b atomic publish endpoint.
 *
 * usePublishSite(communityId) — POST /api/v1/pm/site/publish
 *   - Caller passes `expectedPublishedAt` (the timestamp of the most recent
 *     published state the editor has loaded) to gate optimistic concurrency.
 *   - On success, invalidates the content-blocks query so the editor reloads
 *     and the pending-changes badge clears.
 *   - On 409 ConflictError, throws so the UI can show "Someone else
 *     published — reload and try again."
 *
 * The success body is the discriminated union from publishCommunitySite:
 *   { published: true,  publishedAt: string, promotedCount, retiredCount }
 *   { published: false, reason: 'nothing-to-publish' }
 *
 * `publishedAt` round-trips Date → ISO string through the wire, so we expose
 * it as `string` here. Callers that need a Date can `new Date(...)` it.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

export type PublishSiteResult =
  | {
      published: true;
      publishedAt: string;
      promotedCount: number;
      retiredCount: number;
    }
  | { published: false; reason: 'nothing-to-publish' };

export interface PublishSiteVariables {
  /**
   * ISO 8601 timestamp of the last `published_at` the editor loaded, or
   * `null` for a first-ever publish.
   */
  expectedPublishedAt: string | null;
}

async function readJsonError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? `Request failed (HTTP ${res.status})`;
  } catch {
    return `Request failed (HTTP ${res.status})`;
  }
}

/** Sentinel error subclass so callers can distinguish 409 from other errors. */
export class PublishConflictError extends Error {
  readonly conflict = true as const;
  constructor(message: string) {
    super(message);
    this.name = 'PublishConflictError';
  }
}

export function usePublishSite(communityId: number) {
  const qc = useQueryClient();
  return useMutation<PublishSiteResult, Error, PublishSiteVariables>({
    mutationFn: async ({ expectedPublishedAt }) => {
      const res = await fetch('/api/v1/pm/site/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, expectedPublishedAt }),
      });
      if (res.status === 409) {
        throw new PublishConflictError(await readJsonError(res));
      }
      if (!res.ok) {
        throw new Error(await readJsonError(res));
      }
      const body = (await res.json()) as { data: PublishSiteResult };
      return body.data;
    },
    onSuccess: async () => {
      // Invalidate every editor-related query so the page reloads with the
      // newly-published state. Content blocks reload (drafts cleared); the
      // hero block re-reads its published row; future SoR-block hooks will
      // be invalidated via this same key prefix.
      // Keys mirror the existing hook shapes:
      //   ['pm', 'site', 'blocks', communityId]  — use-content-blocks.ts
      //   ['pm', 'site', 'hero',   communityId]  — use-hero-block.ts
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['pm', 'site', 'blocks', communityId] }),
        qc.invalidateQueries({ queryKey: ['pm', 'site', 'hero', communityId] }),
      ]);
    },
  });
}
