import Link from 'next/link';
import { AdminLayout } from '@/components/AdminLayout';

export default function NotFound() {
  return (
    <AdminLayout>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
            404
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">
            Page not found
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </AdminLayout>
  );
}
