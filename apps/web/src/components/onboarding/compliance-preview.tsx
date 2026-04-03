'use client';

import { cn } from '@/lib/utils';

interface ComplianceCategory {
  templateKey: string;
  title: string;
  category: string;
  statuteReference: string | null;
}

interface CompliancePreviewProps {
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
  categories: ComplianceCategory[];
  onContinue: () => void;
  isLoading?: boolean;
}

const STATUTE_LABELS: Record<string, string> = {
  condo_718: '§718',
  hoa_720: '§720',
  apartment: 'your community type',
};

export function CompliancePreview({
  communityType,
  categories,
  onContinue,
  isLoading,
}: CompliancePreviewProps) {
  const statuteLabel = STATUTE_LABELS[communityType] ?? 'your community type';

  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-content">
          Here&apos;s what Florida requires for your community
        </h1>
        <p className="mt-2 text-base text-content-secondary">
          We&apos;ve mapped {categories.length} document categories based on {statuteLabel}.
          Your dashboard will track progress against these requirements.
        </p>
      </div>

      <div className="mt-8 space-y-3">
        {categories.map((cat) => (
          <div
            key={cat.templateKey}
            className="flex items-center gap-3 rounded-md border border-edge bg-surface-card px-4 py-3"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-status-warning-subtle">
              <svg
                className="h-[18px] w-[18px] text-status-warning"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-medium text-content">{cat.title}</p>
              {cat.statuteReference && (
                <p className="text-sm text-content-secondary">{cat.statuteReference}</p>
              )}
            </div>
            <span className="shrink-0 rounded-full bg-status-warning-subtle px-2.5 py-0.5 text-xs font-medium text-status-warning">
              Needed
            </span>
          </div>
        ))}
      </div>

      <div className="mt-10 text-center">
        <button
          type="button"
          onClick={onContinue}
          disabled={isLoading}
          className={cn(
            'inline-flex h-12 items-center gap-2 rounded-md bg-interactive px-8 text-base font-medium text-white transition-colors hover:bg-interactive-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive',
            isLoading && 'opacity-60',
          )}
        >
          Go to your dashboard
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
    </div>
  );
}
