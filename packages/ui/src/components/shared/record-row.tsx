/**
 * RecordRow — one narrative record (title, status word, meta, optional
 * preview and outcome) in a hairline-separated list. Presentational.
 * Below the `cq-sm` container width the outcome drops under the meta line.
 */
import * as React from "react";
import { cn } from "../../utils/cn";

export interface RecordRowProps {
  /** A <StatusGlyph hideLabel>, or null. */
  lead: React.ReactNode;
  title: React.ReactNode;
  /** Rendered first in the meta line. */
  statusWord: string;
  /** Joined with " · " after the status word. */
  meta?: string[];
  preview?: string;
  outcome?: React.ReactNode;
  outcomeTone?: "plain" | "problem";
}

export function RecordRow({
  lead,
  title,
  statusWord,
  meta,
  preview,
  outcome,
  outcomeTone = "plain",
}: RecordRowProps) {
  const metaLine = [statusWord, ...(meta ?? []).filter((m) => m !== "")].join(" · ");
  return (
    <li className="cq flex items-start gap-3 px-4 py-3">
      {/* The meta line carries the status word, so the glyph is not announced twice. */}
      {lead ? (
        <div className="mt-0.5 shrink-0" aria-hidden="true">
          {lead}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 cq-sm:flex-row cq-sm:items-start cq-sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="min-w-0 truncate text-sm font-medium text-content">{title}</p>
          {preview ? <p className="truncate text-sm text-content-secondary">{preview}</p> : null}
          <p className="text-xs text-content-secondary">{metaLine}</p>
        </div>
        {outcome ? (
          <p
            className={cn(
              "text-sm cq-sm:shrink-0 cq-sm:text-right",
              outcomeTone === "problem" && "font-medium text-status-warning",
            )}
          >
            {outcome}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function RecordList({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn("divide-y divide-edge", className)} {...props} />;
}
