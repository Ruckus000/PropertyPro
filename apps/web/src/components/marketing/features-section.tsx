import React from 'react';

/**
 * Features section showcasing platform capabilities.
 *
 * Highlights: document management, meeting notices, owner portal,
 * mobile app, and compliance dashboard.
 */
export function FeaturesSection() {
  return (
    <section id="features" className="bg-surface-card px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl">
        {/* Section header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-content-link">
            Platform Features
          </p>
          <h2 className="mt-2 text-2xl font-bold text-content sm:text-3xl">
            Everything Your Association Needs
          </h2>
          <p className="mt-3 text-base text-content-secondary">
            A complete compliance and community management platform designed
            specifically for Florida condominium and HOA associations.
          </p>
        </div>

        {/* Feature grid */}
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-md border border-edge bg-surface-card p-6 transition-shadow hover:shadow-e2"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-md bg-interactive-subtle">
                {feature.icon}
              </div>
              <h3 className="text-base font-semibold text-content">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-content-secondary">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const features: ReadonlyArray<{
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    title: 'Document Management',
    description:
      'Upload, organize, and publish association documents with automatic compliance tracking. Supports budgets, meeting minutes, bylaws, and all categories required by Florida statute.',
    icon: <DocumentIcon />,
  },
  {
    title: 'Meeting Notices',
    description:
      'Post board meeting and owner meeting notices with proper advance timing. 48-hour notices for board meetings and 14-day notices for owner meetings, tracked automatically.',
    icon: <CalendarIcon />,
  },
  {
    title: 'Owner Portal',
    description:
      'Secure login for unit owners to access private documents, view announcements, submit maintenance requests, and stay informed about association business.',
    icon: <UsersIcon />,
  },
  {
    title: 'Mobile Access',
    description:
      'Mobile-optimized portal for residents and board members. Email notifications for new announcements, meeting reminders, and document postings.',
    icon: <SmartphoneIcon />,
  },
  {
    title: 'Compliance Dashboard',
    description:
      'Real-time compliance status for all statutory requirements. See at a glance which documents need posting, upcoming deadlines, and your overall compliance score.',
    icon: <ShieldCheckIcon />,
  },
  {
    title: 'Property Manager Tools',
    description:
      'Manage multiple associations from a single dashboard. Portfolio-level compliance reporting, bulk operations, and white-label branding for your management company.',
    icon: <BuildingIcon />,
  },
];

/* ---- Inline SVG Icons ---- */

function DocumentIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-content-link"
      aria-hidden="true"
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-content-link"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-content-link"
      aria-hidden="true"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function SmartphoneIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-content-link"
      aria-hidden="true"
    >
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-content-link"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-content-link"
      aria-hidden="true"
    >
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <line x1="8" y1="6" x2="8.01" y2="6" />
      <line x1="16" y1="6" x2="16.01" y2="6" />
      <line x1="12" y1="6" x2="12.01" y2="6" />
      <line x1="8" y1="10" x2="8.01" y2="10" />
      <line x1="16" y1="10" x2="16.01" y2="10" />
      <line x1="12" y1="10" x2="12.01" y2="10" />
      <line x1="8" y1="14" x2="8.01" y2="14" />
      <line x1="16" y1="14" x2="16.01" y2="14" />
      <line x1="12" y1="14" x2="12.01" y2="14" />
    </svg>
  );
}
