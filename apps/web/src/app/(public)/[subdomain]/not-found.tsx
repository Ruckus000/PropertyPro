import Link from 'next/link';

export default function PublicTenantNotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">PropertyPro Florida</p>
      <h1 className="mt-3 text-3xl font-semibold text-gray-900">Community Not Found</h1>
      <p className="mt-3 text-sm text-gray-600">
        We could not find a public community site for this address.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
      >
        Return Home
      </Link>
    </main>
  );
}
