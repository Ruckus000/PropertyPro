'use client';

/**
 * SetupGuide — the "Setup" state of the guided-blueprint empty state.
 *
 * Spec: docs/design-system/patterns/empty-states.md §4.1, §6 and §6.3. One card:
 * an illustrated hero (text 7/12, art 5/12 on the sky panel), a step rail,
 * then the open step (main, 8/12) beside a context column (4/12). Columns split
 * by the card's own width (cq-md, 720px), so a sidebar-narrowed page stacks.
 *
 * The rail suggests an order and never enforces it: any step opens, except
 * one with a real dependency (`disabledReason`), which stays focusable and
 * says why (aria-disabled).
 *
 * Later steps render as rows that open the step, rather than spec §6.3's
 * in-place disclosures: opening a step already expands it in the main column,
 * so a second, inline copy of its slots would duplicate every control.
 */

import * as React from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { ProgressRing } from '@propertypro/ui';
import { cn } from '@/lib/utils';

export interface SetupStepItem {
  label: string;
  /** "If it applies" items get a text label and a dashed chip (never the border alone, WCAG 1.3.3). */
  conditional?: boolean;
}

export interface SetupStep {
  id: string;
  /** Short rail label, e.g. "Governing". */
  label: string;
  done: boolean;
  /** Completed by the system before anyone arrived (e.g. folders created): checked, unnumbered, listed first. */
  system?: boolean;
  /** Set only for a real dependency ("Residents unlock after units"). */
  disabledReason?: string;
  /** The open step's h3, verb + object: "Upload your governing documents". */
  heading: string;
  description?: string;
  /** Count for this step, e.g. "0 of 5 posted". Also shown on its collapsed row. */
  countLabel?: string;
  /** What the step holds, shown as chips on its collapsed row. */
  items?: SetupStepItem[];
  /** The step's one primary action (the region's only filled button). */
  action?: React.ReactNode;
  /** The open step's body: slots, the real format of what it needs. */
  content?: React.ReactNode;
}

export interface SetupFact {
  icon?: React.ReactNode;
  label: string;
}

export interface SetupGuideProps {
  /** What the page is: "Owner portal records". */
  eyebrow: string;
  /** The outcome: "Post the records owners can see". */
  title: string;
  description: string;
  /** Applicable items only (spec rule 2). Omit on pages with nothing to count. */
  progress?: { done: number; total: number; label: string };
  /** 2–3 true things: defaults on, limits, what happens to their data. */
  facts?: SetupFact[];
  /** A scene at hero size, e.g. `<DocumentsScene size="hero" />`. Decorative. */
  illustration: React.ReactNode;
  steps: SetupStep[];
  /** The context column: ContextSection blocks. */
  context?: React.ReactNode;
  /** Polite live-region text after an action ("Declaration posted. 1 of 13 required."). */
  announcement?: string;
  /** Opens this step first instead of the first open one (e.g. "Continue setup"). */
  initialStepId?: string;
  className?: string;
}

/** First step a manager can act on: not done, not blocked. */
export function firstOpenStepId(steps: SetupStep[]): string | undefined {
  const work = steps.filter((s) => !s.system);
  return (work.find((s) => !s.done && !s.disabledReason) ?? work[0] ?? steps[0])?.id;
}

export function SetupGuide({
  eyebrow,
  title,
  description,
  progress,
  facts,
  illustration,
  steps,
  context,
  announcement,
  initialStepId,
  className,
}: SetupGuideProps) {
  const titleId = React.useId();
  const [openId, setOpenId] = React.useState(() => initialStepId ?? firstOpenStepId(steps));
  const open = steps.find((s) => s.id === openId) ?? steps[0];

  // Number only the manager's own steps; system steps carry a check instead.
  const numbers = new Map<string, number>();
  for (const s of steps) if (!s.system) numbers.set(s.id, numbers.size + 1);
  const workCount = numbers.size;
  const doneCount = steps.filter((s) => s.done).length;

  const openStep = (step: SetupStep) => {
    if (!step.disabledReason) setOpenId(step.id);
  };

  return (
    <section
      aria-labelledby={titleId}
      className={cn('cq overflow-hidden rounded-md border border-edge bg-surface-card', className)}
    >
      {/* Hero */}
      <div className="cq-md:grid cq-md:grid-cols-12">
        <div className="flex min-w-0 flex-col justify-center px-4 py-6 md:px-6 md:py-8 cq-md:col-span-7">
          <p className="text-xs font-medium text-content-secondary">{eyebrow}</p>
          <h2 id={titleId} className="mt-1 text-2xl font-semibold leading-tight tracking-tight text-content">
            {title}
          </h2>
          <p className="mt-2 max-w-[60ch] text-base text-content-secondary">{description}</p>
          {(progress || (facts && facts.length > 0)) && (
            <ul className="mt-6 flex flex-wrap items-center gap-2" aria-label="Progress and good to know">
              {progress && (
                <li className="mr-2 inline-flex items-center gap-2 text-sm text-content-secondary">
                  <ProgressRing done={progress.done} total={progress.total} />
                  <span>
                    <b className="font-semibold tabular-nums text-content">
                      {progress.done} of {progress.total}
                    </b>{' '}
                    {progress.label}
                  </span>
                </li>
              )}
              {facts?.map((fact) => (
                <li
                  key={fact.label}
                  className="inline-flex min-h-8 items-center gap-2 rounded-full border border-edge px-3 text-xs text-content"
                >
                  {fact.icon}
                  {fact.label}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-end justify-center border-t border-edge bg-[var(--teal-50)] px-6 pt-6 max-md:[&>svg]:w-40 cq-md:col-span-5 cq-md:border-l cq-md:border-t-0">
          {illustration}
        </div>
      </div>

      {/* Step rail */}
      <nav aria-label="Setup steps" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-edge px-4 py-3 md:px-6">
        <ol className="flex flex-wrap items-center gap-2">
          {steps.map((step, index) => {
            const isOpen = step.id === open?.id;
            const status = step.done ? 'Completed: ' : isOpen ? 'Current step: ' : 'Not started: ';
            return (
              <li key={step.id} className="flex items-center">
                {index > 0 && <span aria-hidden="true" className="mr-2 h-px w-6 bg-edge-strong" />}
                <button
                  type="button"
                  onClick={() => openStep(step)}
                  aria-current={isOpen ? 'step' : undefined}
                  aria-disabled={step.disabledReason ? true : undefined}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-2 rounded-sm pr-1 text-sm md:min-h-8',
                    isOpen ? 'font-semibold text-content' : 'text-content-secondary',
                    step.disabledReason && 'cursor-not-allowed',
                  )}
                >
                  <StepMarker done={step.done} open={isOpen} number={numbers.get(step.id)} />
                  <span className="sr-only">{status}</span>
                  {step.label}
                  {step.disabledReason && <span className="sr-only">. {step.disabledReason}</span>}
                </button>
              </li>
            );
          })}
        </ol>
        <p className="ml-auto text-xs tabular-nums text-content-secondary">
          {doneCount} of {steps.length} done
        </p>
      </nav>

      {/* Body: open step + later steps | context */}
      <div className="cq-md:grid cq-md:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-6 px-4 py-6 md:px-6 cq-md:col-span-8 cq-md:border-r cq-md:border-edge">
          {open && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs tabular-nums text-content-secondary">
                    {numbers.has(open.id) ? `Step ${numbers.get(open.id)} of ${workCount}` : 'Done for you'}
                    {open.countLabel && ` · ${open.countLabel}`}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-content">{open.heading}</h3>
                  {open.description && (
                    <p className="mt-2 max-w-[65ch] text-sm text-content-secondary">{open.description}</p>
                  )}
                </div>
                {open.action}
              </div>
              {open.content}
            </div>
          )}

          <LaterSteps steps={steps.filter((s) => !s.system && s.id !== open?.id)} numbers={numbers} onOpen={openStep} />
        </div>

        {context && (
          <div className="flex min-w-0 flex-col gap-8 border-t border-edge px-4 py-6 md:px-6 cq-md:col-span-4 cq-md:border-t-0">
            {context}
          </div>
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

function StepMarker({ done, open, number }: { done: boolean; open: boolean; number?: number }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
        done
          ? 'bg-status-success text-content-inverse'
          : open
            ? 'bg-interactive text-content-inverse'
            : 'border border-content-secondary text-content-secondary',
      )}
    >
      {done ? <Check className="size-4" strokeWidth={3} /> : number}
    </span>
  );
}

function LaterSteps({
  steps,
  numbers,
  onOpen,
}: {
  steps: SetupStep[];
  numbers: Map<string, number>;
  onOpen: (step: SetupStep) => void;
}) {
  if (steps.length === 0) return null;
  return (
    <ul aria-label="Other steps" className="border-t border-edge">
      {steps.map((step) => {
        const required = step.items?.filter((i) => !i.conditional) ?? [];
        const conditional = step.items?.filter((i) => i.conditional) ?? [];
        return (
          <li key={step.id} className="border-b border-edge">
            <button
              type="button"
              onClick={() => onOpen(step)}
              aria-disabled={step.disabledReason ? true : undefined}
              className={cn(
                'grid min-h-14 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 py-4 text-left',
                step.disabledReason && 'cursor-not-allowed',
              )}
            >
              <StepMarker done={step.done} open={false} number={numbers.get(step.id)} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-content">{step.label}</span>
                {step.disabledReason && (
                  <span className="mt-1 block text-xs text-content-secondary">{step.disabledReason}</span>
                )}
                {(required.length > 0 || conditional.length > 0) && (
                  <span className="mt-2 flex flex-wrap items-center gap-2">
                    {required.map((item) => (
                      <Chip key={item.label}>{item.label}</Chip>
                    ))}
                    {conditional.length > 0 && (
                      <span className="text-xs text-content-secondary">If it applies:</span>
                    )}
                    {conditional.map((item) => (
                      <Chip key={item.label} dashed>
                        {item.label}
                      </Chip>
                    ))}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-2 text-xs tabular-nums text-content-secondary">
                {step.countLabel}
                <ChevronRight aria-hidden="true" className="size-4" />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Chip({ children, dashed = false }: { children: React.ReactNode; dashed?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex min-h-6 items-center rounded-full border border-edge px-2 text-xs text-content-secondary',
        dashed && 'border-dashed border-edge-strong',
      )}
    >
      {children}
    </span>
  );
}
