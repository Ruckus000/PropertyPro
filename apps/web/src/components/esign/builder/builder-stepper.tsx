'use client';

/**
 * The builder's four-step indicator.
 *
 * Local rather than shared: the only step indicator in the app is
 * `components/onboarding/wizard-shell.tsx`, which is hard-wired to a
 * full-screen gradient rail at `min-h-screen` and will not sit inside a page.
 * (It also takes a 1-indexed `activeStep` while every caller stores 0-indexed
 * state — a trap worth knowing if you read it for reference. This component is
 * 1-indexed throughout, matching `BuilderStep`.)
 *
 * A step the author cannot reach yet is disabled rather than hidden, so the
 * shape of the whole task is visible from the first screen.
 */

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BuilderStep } from '@/lib/esign/builder-state';

export interface BuilderStepperProps {
  current: BuilderStep;
  labels: [string, string, string, string];
  canReach: (step: BuilderStep) => boolean;
  onSelect: (step: BuilderStep) => void;
}

const STEPS: BuilderStep[] = [1, 2, 3, 4];

export function BuilderStepper({ current, labels, canReach, onSelect }: BuilderStepperProps) {
  return (
    <nav aria-label="Progress">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {STEPS.map((step, index) => {
          const label = labels[index] as string;
          const isCurrent = step === current;
          const isDone = step < current;
          const reachable = canReach(step);

          return (
            <li key={step} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSelect(step)}
                disabled={!reachable}
                aria-current={isCurrent ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive',
                  isCurrent
                    ? 'font-semibold text-content'
                    : 'text-content-secondary hover:text-content',
                  !reachable && 'cursor-not-allowed opacity-50 hover:text-content-secondary',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums',
                    isDone && 'border-interactive bg-interactive text-white',
                    isCurrent && !isDone && 'border-interactive text-interactive',
                    !isCurrent && !isDone && 'border-edge text-content-tertiary',
                  )}
                >
                  {isDone ? <Check className="size-3.5" /> : step}
                </span>
                <span>{label}</span>
              </button>

              {index < STEPS.length - 1 && (
                <span aria-hidden="true" className="h-px w-6 bg-edge sm:w-10" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
