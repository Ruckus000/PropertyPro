'use client';

/**
 * The website home's overlays, each fetched as a chunk of its own when first
 * opened: the Add records drawer, the "Doesn't apply" dialog, the per-record
 * upload and the restore confirmation.
 *
 * `next/dynamic` splits a component out only when it is called from a CLIENT
 * module (ruling R12; `community-profile-card-lazy.tsx` measured it), so the
 * calls live here. `ssr: false`: each is mounted only after a click, so the
 * server never has one to render.
 *
 * All four come from ONE module (`website-home-overlays`), so they load as one
 * chunk. Measured 2026-10-29: as four chunks, the drawer's chunk used
 * `useDocumentCategories` without the shared `EmptyState` / `AlertBanner` that
 * every other user of that hook loads beside it, so webpack could no longer
 * keep them in one shared chunk. They were copied into the `(authenticated)`
 * layout's chunk and others instead, and the budgeted routes' unique JS grew
 * 24.1 KiB (1421.3 to 1445.4, over the 1435 ceiling). In one chunk with the
 * upload modal, which loads both, the growth is 11.8 KiB.
 */
import dynamic from 'next/dynamic';

export const LazyAddRecordsDrawer = dynamic(
  () => import('./website-home-overlays').then((mod) => mod.AddRecordsDrawer),
  { ssr: false, loading: () => null },
);

export const LazyNotApplicableDialog = dynamic(
  () => import('./website-home-overlays').then((mod) => mod.NotApplicableDialog),
  { ssr: false, loading: () => null },
);

export const LazyUploadDocumentModal = dynamic(
  () => import('./website-home-overlays').then((mod) => mod.UploadDocumentModal),
  { ssr: false, loading: () => null },
);

export const LazyConfirmDialog = dynamic(
  () => import('./website-home-overlays').then((mod) => mod.ConfirmDialog),
  { ssr: false, loading: () => null },
);
