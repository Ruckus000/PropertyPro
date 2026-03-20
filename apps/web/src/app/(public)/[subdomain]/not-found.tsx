import Link from 'next/link';

export default function PublicTenantNotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-content-link">PropertyPro Florida</p>
      <h1 className="mt-3 text-3xl font-semibold text-content">Community Not Found</h1>
      <p className="mt-3 text-sm text-content-secondary">
        We could not find a public community site for this address.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover"
      >
        Return Home
      </Link>
    </main>
  );
}
