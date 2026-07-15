import type { ReactNode } from 'react';
import { Building2, Check, ShieldCheck } from 'lucide-react';

export interface WizardStepDef {
  title: string;
  description: string;
}

export interface WizardIntro {
  /** Large brand statement in the rail (rendered as body copy, not a heading). */
  title: string;
  subtitle: string;
  /** Short trust/compliance line pinned to the bottom of the rail. */
  trust: string;
}

interface WizardShellProps {
  /** 1-indexed active step (matches the rail's step numbers). */
  activeStep: number;
  steps: WizardStepDef[];
  intro: WizardIntro;
  /** Wizard-level error (save/complete failures); shown atop the right pane. */
  error?: string | null;
  children: ReactNode;
}

/**
 * Two-pane onboarding shell (Variant A "Split Canvas"):
 * a branded left rail carrying identity + vertical progress + a trust line,
 * and a right pane that hosts the active step (form body + sticky footer).
 */
export function WizardShell({ activeStep, steps, intro, error, children }: WizardShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-surface-card lg:flex-row">
      {/* Branded rail */}
      <aside className="relative flex flex-col overflow-hidden bg-gradient-to-b from-[var(--blue-800)] via-[var(--blue-900)] to-[var(--blue-950)] p-8 text-white lg:w-2/5 lg:max-w-xl lg:p-12">
        {/* Ambient glows (decorative) */}
        <div
          className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-white/5 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 ring-1 ring-inset ring-white/20">
            <Building2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-base font-semibold tracking-tight">PropertyPro</span>
        </div>

        <div className="relative mt-12 lg:mt-16">
          <p className="max-w-[14ch] text-[1.75rem] font-bold leading-tight tracking-tight text-balance">
            {intro.title}
          </p>
          <p className="mt-3 hidden max-w-[34ch] text-sm leading-relaxed text-white/70 sm:block">
            {intro.subtitle}
          </p>
        </div>

        <nav aria-label="Progress" className="relative mt-10 lg:mt-14">
          <ol className="flex flex-col">
            {steps.map((step, index) => {
              const stepNumber = index + 1;
              const isCompleted = stepNumber < activeStep;
              const isCurrent = stepNumber === activeStep;
              const isLast = index === steps.length - 1;

              return (
                <li key={step.title} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span
                      aria-current={isCurrent ? 'step' : undefined}
                      className={
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold ' +
                        (isCompleted || isCurrent
                          ? 'border-white bg-white text-interactive'
                          : 'border-white/30 text-white/70')
                      }
                    >
                      {isCompleted ? (
                        <Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" />
                      ) : (
                        stepNumber
                      )}
                    </span>
                    {!isLast && <span className="my-1 w-px grow bg-white/20" aria-hidden="true" />}
                  </div>
                  <div className={isLast ? 'pt-1' : 'pb-8 pt-1'}>
                    <p
                      className={
                        'text-sm font-semibold ' + (isCurrent || isCompleted ? 'text-white' : 'text-white/70')
                      }
                    >
                      {step.title}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-white/55">{step.description}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="relative mt-auto flex items-center gap-2 pt-10 text-xs text-white/70">
          <ShieldCheck className="h-4 w-4 shrink-0 text-white/80" aria-hidden="true" />
          {intro.trust}
        </div>
      </aside>

      {/* Right pane: active step */}
      <div className="flex min-w-0 flex-1 flex-col">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 border-b border-status-danger-border bg-status-danger-bg px-6 py-3 text-sm text-status-danger sm:px-10 lg:px-14"
          >
            {error}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
