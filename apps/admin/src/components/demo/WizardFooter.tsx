'use client';

import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@propertypro/ui';

interface WizardFooterProps {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
  showBack?: boolean;
  onCancel?: () => void;
  loading?: boolean;
}

export function WizardFooter({
  onBack,
  onNext,
  nextLabel,
  nextDisabled = false,
  showBack = true,
  onCancel,
  loading = false,
}: WizardFooterProps) {
  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-[var(--border-default)] bg-[var(--surface-card)] px-6 py-4 -mx-6">
      <div className="flex items-center gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50 disabled:pointer-events-none"
          >
            Cancel
          </button>
        )}
        {showBack && (
          <button
            type="button"
            onClick={onBack}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--border-strong)] bg-[var(--surface-card)] px-4 h-10 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Back
          </button>
        )}
        {!onCancel && !showBack && <div />}
      </div>
      <Button variant="primary" onClick={onNext} disabled={nextDisabled || loading}>
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            Creating...
          </>
        ) : (
          nextLabel
        )}
      </Button>
    </div>
  );
}
