import React from 'react';

/**
 * Hero section for the marketing landing page.
 *
 * Communicates the Florida compliance mandate, the penalty for non-compliance,
 * and a clear CTA to get started.
 */
export function HeroSection() {
  return (
    <section className="bg-gradient-to-b from-blue-50 to-white px-6 pb-20 pt-16 sm:pb-24 sm:pt-20">
      <div className="mx-auto max-w-4xl text-center">
        {/* Compliance badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5">
          <ComplianceShieldIcon />
          <span className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Florida Statute Compliance
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-gray-900 sm:text-4xl md:text-[2.75rem]">
          Your Association Website Is Now
          <br className="hidden sm:block" />
          <span className="text-blue-600"> Required by Florida Law</span>
        </h1>

        {/* Subheadline */}
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-gray-600 sm:text-lg">
          Florida Statute {'\u00A7'}718.111(12)(g) mandates that condominium
          associations maintain a website with specific document posting
          requirements. Non-compliant associations face penalties of{' '}
          <strong className="font-semibold text-gray-900">$50 per day</strong>.
        </p>

        {/* CTA buttons */}
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <a
            href="/signup"
            className="inline-flex w-full items-center justify-center rounded-md bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-e1 transition-colors hover:bg-blue-700 sm:w-auto"
          >
            Get Compliant Now
          </a>
          <a
            href="#features"
            className="inline-flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-6 py-3 text-base font-semibold text-gray-700 transition-colors hover:bg-gray-50 sm:w-auto"
          >
            See How It Works
          </a>
        </div>

        {/* Trust indicators */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500">
          <div className="flex items-center gap-1.5">
            <CheckCircleIcon />
            <span>No setup fees</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircleIcon />
            <span>14-day free trial</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircleIcon />
            <span>Cancel anytime</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Inline SVG shield icon for compliance badge */
function ComplianceShieldIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-blue-600"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

/** Inline SVG checkmark circle icon */
function CheckCircleIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-blue-500"
      aria-hidden="true"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
