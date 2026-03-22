/**
 * Post-conversion success page.
 *
 * Shown after a demo community is converted to a paying customer via Stripe checkout.
 * This is a static page with no data fetching required.
 */

export default function ConvertedPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
        {/* Checkmark Icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
          <svg
            className="h-8 w-8 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        {/* Heading */}
        <h1 className="mb-3 text-2xl font-semibold text-gray-900">
          Your community is now live
        </h1>

        {/* Subtext */}
        <p className="mb-8 text-base text-gray-600">
          Check your email for a link to set your password and get started.
        </p>

        {/* Next Steps List */}
        <div className="space-y-4 text-left">
          <div className="flex gap-3">
            <span className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-medium text-blue-700">
              1
            </span>
            <div>
              <p className="text-sm font-medium text-gray-900">Set your password via welcome email</p>
            </div>
          </div>

          <div className="flex gap-3">
            <span className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-medium text-blue-700">
              2
            </span>
            <div>
              <p className="text-sm font-medium text-gray-900">Invite your first residents</p>
            </div>
          </div>

          <div className="flex gap-3">
            <span className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-medium text-blue-700">
              3
            </span>
            <div>
              <p className="text-sm font-medium text-gray-900">Configure community settings</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
