'use client';

/**
 * The print view's toolbar. Hidden on paper: the browser's print dialog is
 * where "Save as PDF" lives, so the button just opens it.
 */
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AuditPrintActions({ backHref }: { backHref: string }) {
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-3 print:hidden">
      <a
        href={backHref}
        className="inline-flex items-center gap-1.5 rounded-sm text-sm text-content-link underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to the audit trail
      </a>
      <div className="flex items-center gap-3">
        <p className="text-sm text-content-secondary">Choose “Save as PDF” in the print window to keep a copy.</p>
        <Button onClick={() => window.print()}>
          <Printer aria-hidden="true" />
          Print or save as PDF
        </Button>
      </div>
    </div>
  );
}
