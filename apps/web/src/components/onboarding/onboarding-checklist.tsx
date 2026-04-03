'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOnboardingChecklist } from '@/hooks/use-onboarding-checklist';
import { ChecklistCelebration } from './checklist-celebration';
import { cn } from '@/lib/utils';

const ACTION_ROUTES: Record<string, { label: string; href: string }> = {
  upload_first_document: { label: 'Upload', href: '/documents' },
  upload_community_rules: { label: 'Upload', href: '/documents' },
  add_units: { label: 'Add', href: '/settings/units' },
  invite_first_member: { label: 'Invite', href: '/residents' },
  review_compliance: { label: 'View', href: '/compliance' },
  post_announcement: { label: 'Create', href: '/announcements' },
  customize_portal: { label: 'Customize', href: '/settings/branding' },
  review_announcement: { label: 'View', href: '/announcements' },
  check_compliance: { label: 'View', href: '/compliance' },
  access_document: { label: 'Browse', href: '/documents' },
  update_preferences: { label: 'Update', href: '/settings/notifications' },
};

interface OnboardingChecklistProps {
  communityId: number;
  communityName: string;
}

export function OnboardingChecklist({
  communityId,
  communityName,
}: OnboardingChecklistProps) {
  const router = useRouter();
  const { data: items, isLoading } = useOnboardingChecklist(communityId);
  const storageKey = `onboarding-checklist-dismissed-${communityId}`;
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(storageKey) === 'true';
  });

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(storageKey, 'true'); } catch { /* quota */ }
  };

  if (isLoading || !items || items.length === 0) return null;

  const completedCount = items.filter((i) => i.completedAt != null).length;
  const totalCount = items.length;
  const allComplete = completedCount === totalCount;
  const progressPct = (completedCount / totalCount) * 100;

  // Show celebration even if previously dismissed — they earned it
  if (allComplete) {
    // Clear any stale dismissal so the celebration shows
    try { localStorage.removeItem(storageKey); } catch { /* noop */ }
    return (
      <ChecklistCelebration
        communityName={communityName}
        onDismiss={handleDismiss}
        onViewCompliance={() => {
          handleDismiss();
          router.push('/compliance');
        }}
      />
    );
  }

  if (dismissed) return null;

  return (
    <section
      aria-label={`Setup checklist for ${communityName}`}
      className="rounded-md border border-edge bg-surface-card shadow-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-edge px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-content">
            Finish setting up your community
          </h2>
          <p className="mt-0.5 text-sm text-content-secondary">
            {completedCount} of {totalCount} complete
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="flex h-9 w-9 items-center justify-center rounded-md text-content-tertiary transition-colors hover:text-content-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive"
          aria-label="Dismiss checklist"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      <div className="px-5 pt-4">
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-surface-muted"
          role="progressbar"
          aria-valuenow={completedCount}
          aria-valuemin={0}
          aria-valuemax={totalCount}
          aria-label={`${completedCount} of ${totalCount} steps complete`}
        >
          <div
            className="h-full rounded-full bg-status-success transition-all duration-500 motion-reduce:transition-none"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Items list */}
      <ul className="divide-y divide-edge px-5 py-3">
        {items.map((item) => {
          const isComplete = item.completedAt != null;
          const action = ACTION_ROUTES[item.itemKey];

          return (
            <li
              key={item.id}
              className="flex items-center gap-3 py-3"
            >
              {/* Status icon */}
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2',
                  isComplete
                    ? 'border-status-success bg-status-success text-white'
                    : 'border-edge bg-transparent'
                )}
              >
                {isComplete && (
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 12 12"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 6L5 9L10 3"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>

              {/* Item text */}
              <span
                className={cn(
                  'flex-1 text-sm',
                  isComplete
                    ? 'text-content-tertiary line-through'
                    : 'text-content'
                )}
              >
                {item.displayText}
              </span>

              {/* Action link */}
              {!isComplete && action && (
                <button
                  type="button"
                  onClick={() => router.push(action.href)}
                  className="flex-shrink-0 text-sm font-medium text-interactive hover:text-interactive-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive"
                >
                  {action.label}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {/* Footer dismiss */}
      <div className="border-t border-edge px-5 py-3">
        <button
          type="button"
          onClick={handleDismiss}
          className="text-sm text-content-tertiary hover:text-content-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive"
        >
          I&apos;ll handle this later
        </button>
      </div>
    </section>
  );
}
