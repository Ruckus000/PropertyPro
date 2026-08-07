/**
 * 404 page for the operator console.
 *
 * apps/admin calls `notFound()` in several places (an unknown community id, an
 * unknown demo id). Without this file those all rendered Next's unstyled
 * built-in 404 outside the admin shell.
 */
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function NotFound() {
  return (
    <main id="main-content" className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Operator Console
      </p>
      <h1 className="mt-3 text-2xl font-semibold text-gray-900">
        Page not found
      </h1>
      <p className="mt-3 max-w-md text-sm text-gray-600">
        This record doesn&apos;t exist, or it may have been deleted.
      </p>
      <Link
        href="/clients"
        className="mt-6 inline-flex rounded-md bg-coral-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-coral-700 focus:outline-none focus:ring-2 focus:ring-coral-500 focus:ring-offset-2"
      >
        Back to clients
      </Link>
    </main>
  );
}
