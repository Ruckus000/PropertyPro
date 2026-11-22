/**
 * StatusGlyph — five status marks that always carry a word.
 * Status is never colour or shape alone: the label always renders, visibly
 * beside the glyph or `sr-only` when `hideLabel` is set.
 */
import * as React from "react";
import { cn } from "../../utils/cn";

export type StatusGlyphKind = "not-started" | "in-progress" | "attention" | "overdue" | "done";

export interface StatusGlyphProps {
  kind: StatusGlyphKind;
  label: string;
  hideLabel?: boolean;
  className?: string;
}

const COLOR: Record<StatusGlyphKind, string> = {
  "not-started": "text-content-tertiary",
  "in-progress": "text-status-info",
  attention: "text-status-warning",
  overdue: "text-status-danger",
  done: "text-status-success",
};

const CARD = "var(--surface-card)";

function Shape({ kind }: { kind: StatusGlyphKind }) {
  switch (kind) {
    case "not-started":
      return <circle cx="8" cy="8" r="6" strokeDasharray="2.5 2.5" />;
    case "in-progress":
      return (
        <>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" />
        </>
      );
    case "attention":
      return (
        <>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4.75v4" />
          <path d="M8 11.25h.01" />
        </>
      );
    case "overdue":
      return (
        <>
          <circle cx="8" cy="8" r="6.5" fill="currentColor" />
          <path d="M8 4.75v4" stroke={CARD} />
          <path d="M8 11.25h.01" stroke={CARD} />
        </>
      );
    case "done":
      return (
        <>
          <circle cx="8" cy="8" r="6.5" fill="currentColor" />
          <path d="M5.25 8.25l1.9 1.9 3.6-3.9" stroke={CARD} />
        </>
      );
  }
}

export function StatusGlyph({ kind, label, hideLabel, className }: StatusGlyphProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", COLOR[kind], className)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4 shrink-0"
      >
        <Shape kind={kind} />
      </svg>
      <span className={hideLabel ? "sr-only" : "text-sm text-content"}>{label}</span>
    </span>
  );
}
