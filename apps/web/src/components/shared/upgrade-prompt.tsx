'use client';

import { Lock } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface UpgradePromptProps {
  planName: string;
  className?: string;
}

export function UpgradePrompt({ planName, className }: UpgradePromptProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] p-4 shadow-md',
        className,
      )}
      role="alert"
    >
      <div className="flex items-center gap-2">
        <Lock size={16} className="text-[var(--text-tertiary)]" aria-hidden="true" />
        <span className="text-sm font-medium text-[var(--text-primary)]">
          Upgrade required
        </span>
      </div>
      <p className="text-sm text-[var(--text-secondary)]">
        This feature is available on the {planName} plan.
      </p>
      <Link
        href="/settings/billing"
        className="mt-1 inline-flex h-9 items-center justify-center rounded-[10px] bg-[var(--interactive-primary)] px-4 text-sm font-medium text-white transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)] focus-visible:ring-offset-2"
      >
        View Plans
      </Link>
    </div>
  );
}
