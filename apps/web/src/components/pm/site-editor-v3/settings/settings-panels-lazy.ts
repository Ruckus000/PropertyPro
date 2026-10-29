'use client';

/**
 * The panels Site settings hosts for its Pages, Design and Notice tabs, each
 * fetched as a chunk of its own on the tab's first visit.
 *
 * `next/dynamic` splits a component out only when it is called from a client
 * module (ruling R12), so the calls live in a loader module of their own. The
 * editor is within ~100 KiB of its budget and the web aggregate has under 2 KiB
 * to spare: a manager who never opens one of these tabs must not pay for it.
 * `EditorRoot` loads the same modules for the rail until the rail goes, so
 * webpack keeps one chunk per panel.
 */
import dynamic from 'next/dynamic';

export const LazyPagesPanel = dynamic(
  () => import('../panels/PagesPanel').then((m) => m.PagesPanel),
  { loading: () => null },
);

export const LazyDesignPanel = dynamic(
  () => import('../panels/DesignPanel').then((m) => m.DesignPanel),
  { loading: () => null },
);

export const LazyUrgentNoticePanel = dynamic(
  () => import('../panels/UrgentNoticePanel').then((m) => m.UrgentNoticePanel),
  { loading: () => null },
);
