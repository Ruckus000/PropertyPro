'use client';

import { useConfetti } from '@/hooks/use-confetti';
import { cn } from '@/lib/utils';

interface ChecklistCelebrationProps {
  communityName: string;
  onDismiss: () => void;
  onViewCompliance: () => void;
}

export function ChecklistCelebration({
  communityName,
  onDismiss,
  onViewCompliance,
}: ChecklistCelebrationProps) {
  useConfetti({ enabled: true, duration: 3000 });

  return (
    <section className="relative rounded-md border border-edge bg-surface-card p-6 shadow-sm">
      {/* Close button */}
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-md text-content-tertiary transition-colors hover:text-content-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive"
        aria-label="Dismiss"
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

      <div className="flex flex-col items-center text-center">
        {/* Animated check icon */}
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-status-success-subtle">
          <svg
            className="h-10 w-10 text-status-success"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M8 12.5L10.5 15L16 9.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="motion-safe:animate-draw"
              style={{
                strokeDasharray: 20,
                strokeDashoffset: 20,
              }}
            />
          </svg>
        </div>

        <h2 className="mt-4 text-lg font-semibold text-content">
          Your community is set up
        </h2>
        <p className="mt-2 max-w-md text-base text-content-secondary">
          You&apos;ve completed your setup checklist for {communityName}.
          Your dashboard has everything you need going forward.
        </p>

        <button
          type="button"
          onClick={onViewCompliance}
          className="mt-6 inline-flex h-10 items-center gap-2 rounded-md border border-edge bg-surface-card px-4 text-sm font-medium text-content transition-colors hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive"
        >
          View Compliance Dashboard
        </button>
      </div>
    </section>
  );
}
