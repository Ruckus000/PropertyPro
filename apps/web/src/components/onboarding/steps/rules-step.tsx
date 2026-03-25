'use client';

import { useMemo, useState } from 'react';
import { DocumentUploadArea } from '@/components/documents/document-upload-area';
import { useDocumentCategories } from '@/hooks/useDocumentCategories';
import type { UploadDocumentResult } from '@/hooks/useDocumentUpload';
import type { RulesStepData } from '@/lib/onboarding/apartment-wizard-types';
import type { DocumentCategoryOption } from '@/lib/documents/categories';

interface RulesStepProps {
  communityId: number;
  initialData?: RulesStepData | null;
  onNext: (data: RulesStepData | null) => Promise<void> | void;
  onBack: () => void;
}

function pickRulesCategoryId(categories: DocumentCategoryOption[]): number | null {
  if (categories.length === 0) return null;

  const byPriority = [
    (name: string) => name.includes('lease'),
    (name: string) => name.includes('compliance'),
    (name: string) => name.includes('communication'),
  ];

  for (const matcher of byPriority) {
    const match = categories.find((category) => matcher(category.name.toLowerCase()));
    if (match) return match.id;
  }

  return categories[0]?.id ?? null;
}

export function RulesStep({ communityId, initialData, onNext, onBack }: RulesStepProps) {
  const [uploadedRule, setUploadedRule] = useState<RulesStepData | null>(initialData ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    categories,
    isLoading: isLoadingCategories,
    error: categoriesError,
  } = useDocumentCategories(communityId);

  const rulesCategoryId = useMemo(() => pickRulesCategoryId(categories), [categories]);

  function handleUpload(result: UploadDocumentResult): void {
    const document = result.document;
    const documentId = Number(document.id);
    const pathValue =
      typeof document.filePath === 'string'
        ? document.filePath
        : typeof document.path === 'string'
          ? document.path
          : null;

    if (!Number.isFinite(documentId) || !pathValue) {
      setError('Uploaded document is missing required metadata. Please retry upload.');
      return;
    }

    setUploadedRule({
      documentId,
      path: pathValue,
    });
    setError(null);
  }

  async function handleContinue(): Promise<void> {
    if (!uploadedRule) {
      setError('Upload a rules document or use Skip to continue.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onNext(uploadedRule);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to save rules step');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSkip(): Promise<void> {
    setIsSubmitting(true);
    setError(null);
    try {
      await onNext(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to skip rules step');
      setIsSubmitting(false);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-content">Upload Rules Document</h2>
        <p className="mt-1 text-sm text-content-secondary">
          Optional: upload your current community rules document now.
        </p>
      </div>

      <div className="rounded-md border border-edge bg-surface-card p-6">
        {isLoadingCategories ? (
          <p className="text-sm text-content-secondary">Loading upload settings...</p>
        ) : (
          <DocumentUploadArea
            communityId={communityId}
            initialCategoryId={rulesCategoryId}
            onUploaded={handleUpload}
          />
        )}

        {uploadedRule && (
          <p className="mt-3 text-sm text-status-success">
            Rules document uploaded successfully.
          </p>
        )}
      </div>

      {(categoriesError || error) && (
        <div className="rounded-md bg-status-danger-bg p-3 text-sm text-status-danger">
          {categoriesError ?? error}
        </div>
      )}

      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-edge-strong bg-surface-card px-6 py-2 text-sm font-medium text-content-secondary hover:bg-surface-page"
        >
          Back
        </button>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSkip}
            disabled={isSubmitting}
            className="rounded-md border border-edge-strong bg-surface-card px-6 py-2 text-sm font-medium text-content-secondary hover:bg-surface-page disabled:cursor-not-allowed disabled:opacity-60"
          >
            Skip Step
          </button>
          <button
            type="button"
            onClick={handleContinue}
            disabled={isSubmitting}
            className="rounded-md bg-interactive px-6 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Saving...' : 'Next'}
          </button>
        </div>
      </div>
    </section>
  );
}
