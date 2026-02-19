/**
 * Community unavailable page — P2-34a
 *
 * Shown when a community's subscription has expired (status = 'expired').
 * Uses the subdomain from the URL to look up basic branding.
 * Public read access: residents and owners can still see this page.
 */
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Service Unavailable',
  robots: { index: false },
};

interface CommunityUnavailablePageProps {
  params: Promise<{ subdomain: string }>;
}

export default async function CommunityUnavailablePage({
  params,
}: CommunityUnavailablePageProps) {
  const { subdomain } = await params;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6">
      <div className="mx-auto max-w-md text-center">
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <svg
              className="h-8 w-8 text-amber-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-semibold text-gray-900">
          Service Temporarily Unavailable
        </h1>

        <p className="mt-4 text-sm text-gray-600">
          The community portal for <strong>{subdomain}</strong> is currently
          unavailable due to an account issue.
        </p>

        <p className="mt-2 text-sm text-gray-600">
          If you are a board member or property manager, please contact your
          billing administrator to restore access.
        </p>

        <p className="mt-6 text-xs text-gray-400">
          Community data is retained for 90 days. Residents may contact their
          association directly for assistance.
        </p>
      </div>
    </main>
  );
}
