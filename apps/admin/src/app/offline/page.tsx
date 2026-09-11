import { CloudOff } from 'lucide-react';

/**
 * The service worker's navigation fallback: what an installed console shows
 * when the operator opens a page that is not in the cache while offline.
 *
 * Deliberately OUTSIDE the `(console)` route group. The shell in that group is
 * a server component that reads preferences and composes seven signal
 * providers — none of which can run without the network, which is the one
 * condition this page exists to handle. It is also the only page the worker
 * precaches, so it must render with no session and no data.
 *
 * Static by construction (no `force-dynamic`, no data access), so it is
 * prerendered at build time and the precache fetch is a file read.
 */
export const metadata = {
  title: 'Offline · PropertyPro Operator Console',
};

export default function OfflinePage() {
  return (
    <main
      id="main-content"
      className="flex min-h-screen items-center justify-center bg-surface-page px-6 py-12"
    >
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-content-secondary">
          <CloudOff size={24} aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold text-content">You&rsquo;re offline</h1>
        <p className="mt-2 text-sm text-content-secondary">
          This page isn&rsquo;t available without a connection. Pages you&rsquo;ve already opened
          stay readable, but nothing can be changed until you reconnect.
        </p>
        <p className="mt-4 text-sm text-content-tertiary">
          Reconnect and reload to open the console.
        </p>
      </div>
    </main>
  );
}
