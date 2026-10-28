'use client';

import dynamic from 'next/dynamic';
import { SettingsCard } from '@/components/settings/settings-layout';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The Community profile card, fetched as a chunk of its own.
 *
 * A dozen-field form that only managers see, on the route closest to its JS
 * budget (scripts/perf-check.ts). `next/dynamic` splits a client component out
 * only when it is called from a CLIENT module. Called from the settings page
 * itself, which is a server component (and refuses `ssr: false`), it split
 * nothing: the card's code stayed in the page's own chunk and /settings grew
 * 24.3 KiB (1129.0 to 1153.3, measured 2026-10-28), for residents who never see
 * the card as well. So the call lives here, and the page imports this.
 *
 * `ssr: false`, because on the server the card could only render its loading
 * state; it reads its data in the browser. The skeleton here is the same height
 * as the card's own, so the swap moves nothing below it.
 */
export const LazyCommunityProfileCard = dynamic(
  () => import('@/components/settings/community-profile-card').then((mod) => mod.CommunityProfileCard),
  {
    ssr: false,
    loading: () => (
      <SettingsCard>
        <div className="px-5 py-4">
          <Skeleton className="h-96 w-full" />
        </div>
      </SettingsCard>
    ),
  },
);
