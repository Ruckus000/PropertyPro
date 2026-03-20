import { Check } from "lucide-react";

interface ProgressIndicatorProps {
  currentStep: number;
  stepTitles: string[];
}

export function ProgressIndicator({ currentStep, stepTitles }: ProgressIndicatorProps) {
  return (
    <nav aria-label="Progress" className="w-full">
      <ol className="flex items-center justify-between">
        {stepTitles.map((title, index) => {
          const stepNumber = index + 1;
          const isCompleted = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;
          const isFuture = stepNumber > currentStep;

          return (
            <li key={stepNumber} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-2">
                {/* Step Circle */}
                <div
                  className={`
                    flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors
                    ${
                      isCompleted
                        ? "border-interactive bg-interactive text-content-inverse"
                        : isCurrent
                          ? "border-interactive bg-interactive text-content-inverse"
                          : "border-edge-strong bg-surface-card text-content-disabled"
                    }
                  `}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" strokeWidth={3} />
                  ) : (
                    <span>{stepNumber}</span>
                  )}
                </div>

                {/* Step Title */}
                <span
                  className={`
                    text-sm font-medium transition-colors
                    ${
                      isCompleted || isCurrent
                        ? "text-content"
                        : "text-content-disabled"
                    }
                  `}
                >
                  {title}
                </span>
              </div>

              {/* Connector Line */}
              {index < stepTitles.length - 1 && (
                <div
                  className={`
                    mx-2 h-0.5 flex-1 transition-colors sm:mx-4
                    ${
                      stepNumber < currentStep
                        ? "bg-interactive"
                        : "bg-edge-strong"
                    }
                  `}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
