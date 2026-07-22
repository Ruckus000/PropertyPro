'use client';

import { ArrowRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WizardFooter } from './wizard-footer';

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
    <div className="flex flex-1 flex-col">
      <div className="flex-1 px-6 py-10 sm:px-10 lg:px-14">
        <div className="mx-auto w-full max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-content-tertiary">Step 2 of 2</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-content">
            Here&apos;s what Florida requires for your community
          </h1>
          <p className="mt-2 text-sm text-content-secondary">
            We&apos;ve mapped {categories.length} document categories based on {statuteLabel}. Your
            dashboard will track progress against these requirements.
          </p>

          <ul className="mt-8 space-y-3">
            {categories.map((cat) => (
              <li
                key={cat.templateKey}
                className="flex items-center gap-3 rounded-md border border-edge bg-surface-card px-4 py-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-status-warning-subtle text-status-warning">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-content">{cat.title}</p>
                  {cat.statuteReference && (
                    <p className="text-xs text-content-secondary">{cat.statuteReference}</p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-status-warning-subtle px-2.5 py-0.5 text-xs font-medium text-status-warning">
                  Needed
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <WizardFooter>
        <Button type="button" size="lg" onClick={onContinue} loading={isLoading}>
          Go to your dashboard
          <ArrowRight aria-hidden="true" />
        </Button>
      </WizardFooter>
    </div>
  );
}
