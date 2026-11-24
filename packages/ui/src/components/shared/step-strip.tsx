/**
 * StepStrip — where a multi-step flow stands: done, current, upcoming,
 * numbered. It shows progress and nothing else: no step is a link or a
 * button, because Back and Next live in the section footer. Goes in
 * `PageLayout`'s `tabs` slot. Presentational, server-safe.
 *
 * A state is never colour alone. A done step swaps its number for a check
 * mark, the current step has a filled mark and a bold name, and each item
 * carries a visually hidden word ("Done", "Current step", "Not started")
 * beside `aria-current="step"` on the current one.
 */
import * as React from "react";
import { cn } from "../../utils/cn";

export interface StepStripProps {
  /** Step names, in order. */
  steps: string[];
  /** Zero-based index of the current step. Steps before it are done. */
  current: number;
  /** Accessible name of the list. */
  label?: string;
  className?: string;
}

type StepState = "done" | "current" | "upcoming";

const STATE_WORD: Record<StepState, string> = {
  done: "Done: ",
  current: "Current step: ",
  upcoming: "Not started: ",
};

const MARK: Record<StepState, string> = {
  done: "border-edge-strong bg-surface-card text-content",
  current: "border-transparent bg-interactive text-content-inverse",
  upcoming: "border-edge-strong bg-surface-card text-content-secondary",
};

export function StepStrip({ steps, current, label = "Steps", className }: StepStripProps) {
  return (
    <ol
      aria-label={label}
      className={cn("flex flex-wrap items-center gap-x-5 gap-y-2 text-sm", className)}
    >
      {steps.map((name, index) => {
        const state: StepState =
          index < current ? "done" : index === current ? "current" : "upcoming";
        return (
          <li
            key={index}
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
            className="flex items-center gap-2"
          >
            <span
              data-step-mark=""
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                MARK[state],
              )}
            >
              {state === "done" ? (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3.5"
                >
                  <path d="M3.5 8.5l3 3 6-6.5" />
                </svg>
              ) : (
                index + 1
              )}
            </span>
            <span>
              <span className="sr-only">{STATE_WORD[state]}</span>
              <span
                data-step-name=""
                className={state === "current" ? "font-semibold text-content" : "text-content-secondary"}
              >
                {name}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
