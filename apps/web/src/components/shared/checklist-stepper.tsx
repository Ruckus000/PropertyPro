'use client';

import { useState } from 'react';
import { CheckCircle2, Circle, ChevronDown, ChevronUp } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Step {
  key: string;
  label: string;
  completed: boolean;
  completedAt?: string;
  completedBy?: string;
  notes?: string;
  linkedEntityType?: string;
  linkedEntityId?: number;
  autoCompleted?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

interface ChecklistStepperProps {
  steps: Step[];
  onStepToggle: (stepKey: string, completed: boolean) => void;
  onStepNotesChange?: (stepKey: string, notes: string) => void;
  disabled?: boolean;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ChecklistStepper({ steps, onStepToggle, onStepNotesChange, disabled }: ChecklistStepperProps) {
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  const toggleNotes = (key: string) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="relative space-y-0">
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1;
        const notesOpen = expandedNotes.has(step.key);

        return (
          <div key={step.key} className="relative flex gap-3 pb-6">
            {/* Vertical connector line */}
            {!isLast && (
              <div
                className={cn(
                  'absolute left-[11px] top-6 w-0.5 -bottom-0',
                  step.completed ? 'bg-green-200' : 'bg-border',
                )}
              />
            )}

            {/* Step indicator */}
            <div className="relative z-10 flex-shrink-0 pt-0.5">
              {step.completed ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : (
                <Circle className="h-6 w-6 text-muted-foreground/40" />
              )}
            </div>

            {/* Step content */}
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={step.completed}
                  onCheckedChange={(checked) => onStepToggle(step.key, Boolean(checked))}
                  disabled={disabled}
                  className="sr-only"
                  id={`step-${step.key}`}
                />
                <label
                  htmlFor={`step-${step.key}`}
                  className={cn(
                    'text-sm font-medium cursor-pointer select-none',
                    step.completed && 'text-muted-foreground line-through',
                    disabled && 'cursor-not-allowed opacity-50',
                  )}
                  onClick={() => !disabled && onStepToggle(step.key, !step.completed)}
                >
                  {step.label}
                </label>
                {step.autoCompleted && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    Auto-completed
                  </Badge>
                )}
              </div>

              {step.completed && (step.completedBy || step.completedAt) && (
                <p className="text-xs text-muted-foreground">
                  {step.completedBy && <>Completed by {step.completedBy}</>}
                  {step.completedBy && step.completedAt && ' at '}
                  {step.completedAt && formatDate(step.completedAt)}
                </p>
              )}

              <div className="flex items-center gap-2">
                {step.actionLabel && step.onAction && (
                  <button
                    type="button"
                    onClick={step.onAction}
                    disabled={disabled}
                    className="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                  >
                    {step.actionLabel}
                  </button>
                )}

                {onStepNotesChange && (
                  <button
                    type="button"
                    onClick={() => toggleNotes(step.key)}
                    className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {notesOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    Notes
                  </button>
                )}
              </div>

              {onStepNotesChange && notesOpen && (
                <textarea
                  value={step.notes ?? ''}
                  onChange={(e) => onStepNotesChange(step.key, e.target.value)}
                  disabled={disabled}
                  placeholder="Add notes..."
                  rows={2}
                  className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { ChecklistStepper, type ChecklistStepperProps, type Step as ChecklistStep };
