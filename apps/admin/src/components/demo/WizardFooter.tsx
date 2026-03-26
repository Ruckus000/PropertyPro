'use client';

import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
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
    <div className="flex items-center justify-between gap-3 border-t border-[var(--border-default)] bg-[var(--surface-card)] px-6 py-4">
      <div className="flex items-center gap-4">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50 disabled:pointer-events-none"
          >
            Cancel
          </button>
        )}
        {showBack && (
          <Button
            variant="secondary"
            size="lg"
            leftIcon={<ArrowLeft />}
            onClick={onBack}
            disabled={loading}
          >
            Back
          </Button>
        )}
        {!onCancel && !showBack && <div />}
      </div>
      <Button
        variant="primary"
        size="lg"
        rightIcon={!loading ? <ArrowRight /> : undefined}
        onClick={onNext}
        disabled={nextDisabled || loading}
        loading={loading}
      >
        {loading ? 'Creating...' : nextLabel}
      </Button>
    </div>
  );
}
