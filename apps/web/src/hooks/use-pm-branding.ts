'use client';

import { useMutation } from '@tanstack/react-query';
import type { CommunityBranding } from '@propertypro/shared';

export type BrandingProperty =
  | 'logoPath'
  | 'primaryColor'
  | 'secondaryColor'
  | 'accentColor'
  | 'fontHeading'
  | 'fontBody';

export interface CopyBrandingInput {
  sourceBranding: CommunityBranding;
  properties: Iterable<BrandingProperty>;
  communityIds: Iterable<number>;
}

export interface CopyBrandingResult {
  succeeded: number;
  total: number;
}

export function useCopyBranding() {
  return useMutation<CopyBrandingResult, Error, CopyBrandingInput>({
    // Documented exception to the requestJson rule: this is a bulk
    // Promise.allSettled fan-out over N communities. requestJson is a
    // single-request unwrap helper and does not fit the per-community
    // settle/aggregate shape; the per-community error string is internal
    // only (never rendered — only the {succeeded,total} count surfaces).
    mutationFn: async ({ sourceBranding, properties, communityIds }) => {
      const patch: Record<string, unknown> = {};
      for (const prop of properties) {
        const value = sourceBranding[prop];
        if (value !== undefined) {
          // Map logoPath to logoStoragePath for the branding API
          if (prop === 'logoPath') {
            patch['logoStoragePath'] = value;
          } else {
            patch[prop] = value;
          }
        }
      }

      const results = await Promise.allSettled(
        Array.from(communityIds).map(async (communityId) => {
          const res = await fetch('/api/v1/pm/branding', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ communityId, ...patch }),
          });

          if (!res.ok) {
            const json = (await res.json()) as {
              error?: { message?: string };
            };
            throw new Error(
              json.error?.message ?? `Failed for community ${communityId}`,
            );
          }

          return communityId;
        }),
      );

      const succeeded = results.filter(
        (r) => r.status === 'fulfilled',
      ).length;
      return { succeeded, total: results.length };
    },
  });
}
