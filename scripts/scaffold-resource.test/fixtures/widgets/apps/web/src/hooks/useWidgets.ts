'use client';

import { useEffect, useState } from 'react';
import type { Infer } from '@propertypro/api-contract';
import { walkPaginated } from '@/lib/api/walk-paginated';
import type { widgetsListContract } from '@/app/api/v1/widgets/contract';

/**
 * Loads every widget for a community via the canonical `walkPaginated()`
 * helper (Plan B3). The item shape is derived from the route contract
 * (Plan A1) so the hook stays in lockstep with the route's declared response
 * schema — no duplicated interface.
 *
 * Scaffolded by `pnpm new:resource widgets` (Plan A4 reference resource).
 *
 * Cancellation: pairs an `AbortController` with the helper's `signal` option.
 * If `communityId` changes mid-walk (or the component unmounts), the in-
 * flight request is cancelled at the network layer rather than discarded
 * client-side.
 */
export type WidgetItem =
  Infer<typeof widgetsListContract>['data'][number];

export function useWidgets(communityId: number) {
  const [widgets, setWidgets] = useState<WidgetItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadWidgets(): Promise<void> {
      setIsLoading(true);
      setError(null);
      try {
        const collected = await walkPaginated<WidgetItem>(
          '/api/v1/widgets',
          { communityId: String(communityId) },
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) setWidgets(collected);
      } catch (loadError) {
        if (controller.signal.aborted) return; // expected on unmount / id change
        setWidgets([]);
        setError(loadError instanceof Error ? loadError.message : 'Failed to load widgets');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadWidgets();

    return () => controller.abort();
  }, [communityId]);

  return { widgets, isLoading, error };
}
