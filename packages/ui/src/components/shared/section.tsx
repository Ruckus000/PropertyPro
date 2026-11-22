/**
 * Section kit — the box and its parts for a page body: header, toolbar,
 * footer, first-run block and error block. Presentational, server-safe.
 */
import * as React from "react";
import { cn } from "../../utils/cn";

export function Section({
  bare,
  className,
  ...props
}: React.HTMLAttributes<HTMLElement> & { bare?: boolean }) {
  return (
    <section
      className={cn(!bare && "overflow-hidden rounded-md border border-edge bg-surface-card", className)}
      {...props}
    />
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-edge-strong px-4 py-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-content">{title}</h2>
        {description ? <p className="text-sm text-content-secondary">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function SectionToolbar({
  filters,
  search,
  bulk,
}: {
  filters?: React.ReactNode;
  search?: React.ReactNode;
  bulk?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-edge px-4">
      {bulk ? (
        <div className="flex min-w-0 flex-1 items-center gap-2 py-2">{bulk}</div>
      ) : (
        <div data-filters className="min-w-0 flex-1 overflow-x-auto">
          {filters}
        </div>
      )}
      {search ? <div className="shrink-0 py-2">{search}</div> : null}
    </div>
  );
}

export function SectionFooter({
  note,
  children,
}: {
  note?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-edge px-4 py-2 text-xs text-content-secondary">
      <span className="min-w-0">{note}</span>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}

export function SectionFirstRun({
  title,
  description,
  action,
  example,
  exampleLabel,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  example?: React.ReactNode;
  exampleLabel?: string;
}) {
  return (
    <div className="flex flex-col items-start gap-3 px-4 py-6">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-content">{title}</h3>
        <p className="text-sm text-content-secondary">{description}</p>
      </div>
      {action}
      {example ? (
        <div className="w-full space-y-2">
          {exampleLabel ? <p className="text-xs text-content-secondary">{exampleLabel}</p> : null}
          <div aria-hidden="true">{example}</div>
        </div>
      ) : null}
    </div>
  );
}

export function SectionError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 px-4 py-4">
      <p className="text-sm text-status-danger">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 shrink-0 text-sm font-medium text-content-link hover:text-content-link-hover md:min-h-0"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
