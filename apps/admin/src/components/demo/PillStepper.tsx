'use client';

import { Check, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PillStep {
  id: string;
  label: string;
}

interface PillStepperProps {
  steps: PillStep[];
  currentStep: string;
  completedSteps: Set<string>;
  errorSteps?: Set<string>;
  onStepClick: (stepId: string) => void;
}

export function PillStepper({
  steps,
  currentStep,
  completedSteps,
  errorSteps = new Set(),
  onStepClick,
}: PillStepperProps) {
  const currentIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="flex flex-row gap-2" role="list">
      {steps.map((step, index) => {
        const isActive = step.id === currentStep;
        const isCompleted = completedSteps.has(step.id);
        const isError = errorSteps.has(step.id);
        const isUpcoming = !isActive && !isCompleted && !isError && index > currentIndex;
        const stepNumber = index + 1;

        if (isActive) {
          return (
            <span
              key={step.id}
              role="listitem"
              aria-current="step"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium',
                'bg-[var(--interactive-primary)] text-white'
              )}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/30 text-[10px] font-semibold">
                {stepNumber}
              </span>
              {step.label}
            </span>
          );
        }

        if (isCompleted) {
          return (
            <button
              key={step.id}
              role="listitem"
              type="button"
              onClick={() => onStepClick(step.id)}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium',
                'bg-[color:var(--status-success-bg,#dcfce7)] text-[var(--status-success)]'
              )}
            >
              <Check className="h-3 w-3" />
              {step.label}
            </button>
          );
        }

        if (isError) {
          return (
            <button
              key={step.id}
              role="listitem"
              type="button"
              onClick={() => onStepClick(step.id)}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-[var(--status-danger)] px-3.5 py-1.5 text-xs font-medium',
                'text-[var(--status-danger)]'
              )}
            >
              <AlertTriangle className="h-3 w-3" />
              {step.label}
            </button>
          );
        }

        // Upcoming
        return (
          <span
            key={step.id}
            role="listitem"
            className={cn(
              'inline-flex cursor-default items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium pointer-events-none',
              'bg-[var(--surface-muted)] text-[var(--text-secondary)]'
            )}
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-black/10 text-[10px] font-semibold">
              {stepNumber}
            </span>
            {step.label}
          </span>
        );
      })}
    </div>
  );
}
