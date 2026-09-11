/**
 * The authenticated console: every operator-facing page lives under this route
 * group so the shell is rendered exactly once, here, instead of being imported
 * by hand in each page (which is what `AdminLayout` was).
 *
 * Route groups do not appear in URLs, so nothing about the console's paths
 * changed when the pages moved in here — `/dashboard` is still `/dashboard`, and
 * the root redirect still points at it.
 *
 * AUTHZ: `requireAdminPageSession()` runs before anything else is read. It is
 * not a convenience — this console reads cross-tenant data through a
 * service-role client that bypasses row-level security, so authorization is the
 * only boundary. Pages keep their own call to it as well: a layout is not a
 * security boundary in the App Router (a request for a page's RSC payload does
 * not necessarily re-run an ancestor layout), so the per-page assertion stays.
 */
import type { ReactNode } from 'react';
import { AdminShell } from '@/components/shell/AdminShell';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getPreferences } from '@/lib/server/preferences';
import { getShellSignals } from '@/lib/server/shell-signals';

export const dynamic = 'force-dynamic';

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const session = await requireAdminPageSession();
  // Per-operator: the tray's read watermark, and the error-spike threshold the
  // critical banner is derived against. `getPreferences` never throws — an
  // operator with no row (the common case until they open Settings) gets the
  // same defaults the console had before wave 4, so the shell cannot be taken
  // down by a preferences read.
  const preferences = await getPreferences(session.id);
  const initialSignals = await getShellSignals(preferences.alertPrefs.errorSpikeThreshold);
  // `email` can be '' — admin-page-context defaults it rather than failing, so
  // the avatar falls back to 'A' instead of rendering an empty circle.
  const initial = (session.email[0] ?? 'A').toUpperCase();

  return (
    <AdminShell
      user={{ email: session.email, initial }}
      initialSignals={initialSignals}
      initialReadAt={preferences.notificationsReadAt}
    >
      {children}
    </AdminShell>
  );
}
