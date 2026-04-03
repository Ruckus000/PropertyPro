'use client';

import { useOnboardingChecklist } from '@/hooks/use-onboarding-checklist';

interface ChecklistSidebarIndicatorProps {
  communityId: number;
  onClick: () => void;
}

const RING_SIZE = 24;
const STROKE = 3;
const RADIUS = (RING_SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ChecklistSidebarIndicator({
  communityId,
  onClick,
}: ChecklistSidebarIndicatorProps) {
  const { data: items } = useOnboardingChecklist(communityId);

  if (!items || items.length === 0) return null;

  const completed = items.filter((i) => i.completedAt != null).length;
  const total = items.length;

  if (completed === total) return null; // All done, hide indicator

  const offset = CIRCUMFERENCE - (completed / total) * CIRCUMFERENCE;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-content-secondary transition-colors hover:bg-surface-muted hover:text-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive"
      aria-label={`Setup progress: ${completed} of ${total} complete. Click to expand checklist.`}
    >
      <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--surface-muted)"
          strokeWidth={STROKE}
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--interactive-primary)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-400"
        />
      </svg>
      <span className="tabular-nums">
        Setup: {completed}/{total}
      </span>
    </button>
  );
}
