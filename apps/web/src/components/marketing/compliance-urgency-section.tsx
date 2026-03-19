import React from 'react';

/**
 * Compliance urgency section.
 *
 * Communicates the January 2026 deadline for 25-149 unit condos,
 * penalty details, and enforcement information with statute references.
 */
export function ComplianceUrgencySection() {
  return (
    <section id="compliance" className="bg-surface-card px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl">
        {/* Section header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-content-link">
            Compliance Timeline
          </p>
          <h2 className="mt-2 text-2xl font-bold text-content sm:text-3xl">
            The Deadline Is Approaching
          </h2>
          <p className="mt-3 text-base text-content-secondary">
            Florida law requires condominium and HOA associations to maintain
            compliant websites. Understand the requirements and timeline.
          </p>
        </div>

        {/* Timeline cards */}
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {/* Condo requirements */}
          <div className="rounded-md border border-edge bg-surface-card p-6">
            <div className="mb-4 inline-flex items-center gap-2 rounded-md bg-interactive-subtle px-3 py-1.5">
              <span className="text-xs font-semibold text-content-link">
                Condominiums
              </span>
            </div>
            <h3 className="text-lg font-semibold text-content">
              Florida Statute {'\u00A7'}718.111(12)(g)
            </h3>
            <div className="mt-4 space-y-4">
              <TimelineItem
                title="150+ unit associations"
                description="Already required to maintain a website with posted official records. Enforcement is active."
                status="active"
              />
              <TimelineItem
                title="25-149 unit associations"
                description="Must have a compliant website by January 1, 2026. This includes document posting, meeting notices, and an owner portal."
                status="upcoming"
              />
              <TimelineItem
                title="Under 25 units"
                description="Currently exempt from website requirements, but voluntary compliance is recommended for transparency."
                status="exempt"
              />
            </div>
          </div>

          {/* HOA requirements */}
          <div className="rounded-md border border-edge bg-surface-card p-6">
            <div className="mb-4 inline-flex items-center gap-2 rounded-md bg-interactive-subtle px-3 py-1.5">
              <span className="text-xs font-semibold text-content-link">
                HOAs
              </span>
            </div>
            <h3 className="text-lg font-semibold text-content">
              Florida Statute {'\u00A7'}720.303(4)
            </h3>
            <div className="mt-4 space-y-4">
              <TimelineItem
                title="100+ parcel associations"
                description="Required to maintain a website for official records and meeting notices. Same document posting requirements as condos."
                status="active"
              />
              <TimelineItem
                title="Under 100 parcels"
                description="Currently exempt from website requirements, but voluntary compliance builds owner trust."
                status="exempt"
              />
            </div>
          </div>
        </div>

        {/* Penalty and enforcement block */}
        <div className="mt-10 rounded-md border border-status-danger-border bg-status-danger-bg p-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-start">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <AlertIcon />
                <h3 className="text-base font-semibold text-status-danger">
                  Penalties for Non-Compliance
                </h3>
              </div>
              <ul className="mt-3 space-y-2 text-sm text-status-danger">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 block h-1 w-1 shrink-0 rounded-full bg-status-danger" />
                  <span>
                    <strong>$50 per day</strong> civil penalty for failure to
                    maintain a compliant website per {'\u00A7'}718.501(1)(d)
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 block h-1 w-1 shrink-0 rounded-full bg-status-danger" />
                  <span>
                    Documents must be posted within <strong>30 days</strong> of
                    creation or receipt
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 block h-1 w-1 shrink-0 rounded-full bg-status-danger" />
                  <span>
                    Board members may face personal liability for willful
                    non-compliance
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 block h-1 w-1 shrink-0 rounded-full bg-status-danger" />
                  <span>
                    The Division of Condominiums, Timeshares, and Mobile Homes
                    (DBPR) enforces compliance through the arbitration process
                  </span>
                </li>
              </ul>
            </div>
            <div className="shrink-0 md:text-right">
              <a
                href="/signup"
                className="inline-flex items-center rounded-md bg-red-700 px-5 py-2.5 text-sm font-semibold text-content-inverse transition-colors hover:bg-red-800"
              >
                Get Compliant Now
              </a>
              <p className="mt-2 text-xs text-status-danger">
                Set up in under 15 minutes
              </p>
            </div>
          </div>
        </div>

        {/* Required documents overview */}
        <div className="mt-10">
          <h3 className="text-center text-base font-semibold text-content">
            Required Document Categories
          </h3>
          <p className="mt-1 text-center text-sm text-content-tertiary">
            Florida statute requires these categories to be accessible on your
            association website
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {requiredDocuments.map((doc) => (
              <div
                key={doc.category}
                className="rounded-md border border-edge bg-surface-page px-4 py-3"
              >
                <p className="text-sm font-medium text-content">
                  {doc.category}
                </p>
                <p className="mt-0.5 text-xs text-content-tertiary">{doc.examples}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

interface TimelineItemProps {
  title: string;
  description: string;
  status: 'active' | 'upcoming' | 'exempt';
}

function TimelineItem({ title, description, status }: TimelineItemProps) {
  const statusConfig = {
    active: {
      dotColor: 'bg-red-500',
      label: 'Required Now',
      labelColor: 'text-status-danger bg-status-danger-bg border-status-danger-border',
    },
    upcoming: {
      dotColor: 'bg-amber-500',
      label: 'Jan 2026',
      labelColor: 'text-status-warning bg-status-warning-bg border-status-warning-border',
    },
    exempt: {
      dotColor: 'bg-surface-muted',
      label: 'Exempt',
      labelColor: 'text-content-secondary bg-surface-page border-edge',
    },
  };

  const config = statusConfig[status];

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${config.dotColor}`} />
        <div className="w-px flex-1 bg-edge" />
      </div>
      <div className="pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold text-content">{title}</h4>
          <span
            className={`inline-flex rounded-md border px-1.5 py-0.5 text-xs font-medium ${config.labelColor}`}
          >
            {config.label}
          </span>
        </div>
        <p className="mt-1 text-sm text-content-secondary">{description}</p>
      </div>
    </div>
  );
}

const requiredDocuments: ReadonlyArray<{
  category: string;
  examples: string;
}> = [
  {
    category: 'Governing Documents',
    examples: 'Declaration, bylaws, articles of incorporation, rules',
  },
  {
    category: 'Financial Records',
    examples: 'Annual budget, financial statements, reserve studies',
  },
  {
    category: 'Meeting Materials',
    examples: 'Agendas, minutes, voting records, proxy forms',
  },
  {
    category: 'Contracts & Insurance',
    examples: 'Vendor contracts, insurance policies, certificates',
  },
];

function AlertIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-status-danger"
      aria-hidden="true"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
