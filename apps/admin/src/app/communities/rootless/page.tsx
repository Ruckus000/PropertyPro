import { redirect } from 'next/navigation';

/**
 * Folded into Clients (spec D9): the rootless filter and the root-claim
 * dispute banner live there now — see `(console)/clients/page.tsx` and
 * `lib/server/clients.ts`.
 *
 * Deliberately OUTSIDE the `(console)` route group. Left inside it, this
 * redirect would pay `(console)/layout.tsx`'s `requireAdminPageSession()` and
 * `getShellSignals()` reads and paint the full console shell from
 * `app/loading.tsx` before bouncing away from it — wasted work for a page
 * whose only job is to leave. Route groups don't affect URLs, so
 * `/communities/rootless` is unchanged.
 */
export default function RootlessRedirect() {
  redirect('/clients?filter=rootless');
}
