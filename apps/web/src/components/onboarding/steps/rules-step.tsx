'use client';

import { useEffect, useMemo, useState } from 'react';
import { DocumentUploadArea } from '@/components/documents/document-upload-area';
import type { RulesStepData } from '@/lib/onboarding/apartment-wizard-types';

interface DocumentCategorySummary {
  id: number;
  name: string;
}

interface RulesStepProps {
  communityId: number;
  initialData?: RulesStepData | null;
  onNext: (data: RulesStepData | null) => Promise<void> | void;
  onBack: () => void;
}

function pickRulesCategoryId(categories: DocumentCategorySummary[]): number | null {
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
  const [categories, setCategories] = useState<DocumentCategorySummary[]>([]);
  const [uploadedRule, setUploadedRule] = useState<RulesStepData | null>(initialData ?? null);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadCategories(): Promise<void> {
      setIsLoadingCategories(true);
      try {
        const response = await fetch(`/api/v1/document-categories?communityId=${communityId}`);
        if (!response.ok) {
          throw new Error('Failed to load document categories');
        }
        const body = (await response.json()) as {
          data: Array<{ id: number; name: string }>;
        };

        if (active) {
          setCategories(body.data);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load categories');
        }
      } finally {
        if (active) {
          setIsLoadingCategories(false);
        }
      }
    }

    loadCategories();

    return () => {
      active = false;
    };
  }, [communityId]);

  const rulesCategoryId = useMemo(() => pickRulesCategoryId(categories), [categories]);

  function handleUpload(document: Record<string, unknown>): void {
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
        <h2 className="text-2xl font-semibold text-gray-900">Upload Rules Document</h2>
        <p className="mt-1 text-sm text-gray-600">
          Optional: upload your current community rules document now.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        {isLoadingCategories ? (
          <p className="text-sm text-gray-600">Loading upload settings...</p>
        ) : (
          <DocumentUploadArea
            communityId={communityId}
            categoryId={rulesCategoryId}
            onUploaded={handleUpload}
          />
        )}

        {uploadedRule && (
          <p className="mt-3 text-sm text-green-700">
            Rules document uploaded successfully.
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-gray-300 bg-white px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Back
        </button>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSkip}
            disabled={isSubmitting}
            className="rounded-md border border-gray-300 bg-white px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Skip Step
          </button>
          <button
            type="button"
            onClick={handleContinue}
            disabled={isSubmitting}
            className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Saving...' : 'Next'}
          </button>
        </div>
      </div>
    </section>
  );
}
