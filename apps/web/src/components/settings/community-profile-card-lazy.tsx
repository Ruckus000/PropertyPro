'use client';

import dynamic from 'next/dynamic';
import { CommunityProfileCardSkeleton } from '@/components/settings/community-profile-card-skeleton';

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
 * state; it reads its data in the browser. The placeholder is the card's own
 * loading state, so the swap moves nothing and is announced once.
 */
export const LazyCommunityProfileCard = dynamic(
  () => import('@/components/settings/community-profile-card').then((mod) => mod.CommunityProfileCard),
  {
    ssr: false,
    loading: () => <CommunityProfileCardSkeleton />,
  },
);
