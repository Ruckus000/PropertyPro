/**
 * 404 for URLs that match no route at all.
 *
 * This is the whole-app fallback: Next.js routes an UNMATCHED url to the root
 * `not-found`, which never enters a route group, so `(console)/layout.tsx` does
 * not run and there is no shell to render inside. That is why this file owns
 * `<main id="main-content">` itself — nothing else provides the skip-link
 * landmark here.
 *
 * `notFound()` raised from a console page is a different case and no longer
 * lands here: `(console)/not-found.tsx` catches it and keeps the shell. Keep
 * the copy below about an unknown ADDRESS, and the record-not-found wording
 * there.
 */
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function NotFound() {
  return (
    <main id="main-content" className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-content-tertiary">
        Operator Console
      </p>
      <h1 className="mt-3 text-2xl font-semibold text-content">
        Page not found
      </h1>
      <p className="mt-3 max-w-md text-sm text-content-secondary">
        That address doesn&apos;t match anything in the console.
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
