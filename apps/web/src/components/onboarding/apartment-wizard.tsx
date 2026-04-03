'use client';

/**
 * Apartment Onboarding Wizard — 2-step flow
 *
 * 0 Profile -> 1 Compliance Preview
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getComplianceTemplate } from '@propertypro/shared';
import { ProgressIndicator } from './progress-indicator';
import { ProfileStep } from './steps';
import { CompliancePreview } from './compliance-preview';
import type {
  ApartmentWizardStatePayload,
  ProfileStepData,
  WizardStepData,
} from '@/lib/onboarding/apartment-wizard-types';

interface ApartmentWizardProps {
  communityId: number;
  communityType: string;
  initialState?: ApartmentWizardStatePayload;
}

const STEP_TITLES = ['Community Profile', 'Compliance Preview'];

interface ApiErrorResponse {
  error?: string | { code?: string; message?: string };
}

function mergeStepData(previous: WizardStepData, patch: Partial<WizardStepData>): WizardStepData {
  return {
    ...previous,
    ...patch,
    completionMarkers: {
      ...(previous.completionMarkers ?? {}),
      ...(patch.completionMarkers ?? {}),
    },
  };
}

async function readApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorResponse;
    if (typeof body.error === 'string') return body.error;
    if (body.error && typeof body.error === 'object') return body.error.message ?? 'Request failed';
    return 'Request failed';
  } catch {
    return 'Request failed';
  }
}

export function ApartmentWizard({ communityId, communityType, initialState }: ApartmentWizardProps) {
  const router = useRouter();
  const initialStep = Math.max(0, Math.min(initialState?.nextStep ?? 0, STEP_TITLES.length - 1));
  const [currentStep, setCurrentStep] = useState<number>(initialStep);
  const [stepData, setStepData] = useState<WizardStepData>(initialState?.stepData ?? {});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complianceCategories = getComplianceTemplate(
    communityType as 'condo_718' | 'hoa_720' | 'apartment',
  ).map((item) => ({
    templateKey: item.templateKey,
    title: item.title,
    category: item.category,
    statuteReference: item.statuteReference,
  }));

  async function saveStep(step: number, patch: Partial<WizardStepData>): Promise<void> {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/onboarding/apartment?communityId=${communityId}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          communityId,
          step,
          stepData: patch,
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setStepData((previous) => mergeStepData(previous, patch));
      setCurrentStep(Math.min(step + 1, STEP_TITLES.length - 1));
    } finally {
      setIsSaving(false);
    }
  }

  async function completeWizard(): Promise<void> {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/onboarding/apartment?communityId=${communityId}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          communityId,
          action: 'complete',
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      router.push(`/dashboard?communityId=${communityId}`);
      return;
    } catch (completeError) {
      setError(
        completeError instanceof Error ? completeError.message : 'Failed to complete onboarding',
      );
      setIsSaving(false);
    }
  }

  async function handleProfileNext(data: ProfileStepData): Promise<void> {
    try {
      await saveStep(0, { profile: data });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save profile step');
      setIsSaving(false);
    }
  }

  async function handleComplianceContinue(): Promise<void> {
    await completeWizard();
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-content">Welcome to PropertyPro</h1>
        <p className="mt-2 text-content-secondary">Set up your community profile and review compliance requirements.</p>
      </div>

      <ProgressIndicator currentStep={Math.min(currentStep + 1, STEP_TITLES.length)} stepTitles={STEP_TITLES} />

      {error && (
        <div className="my-4 rounded-md bg-status-danger-bg p-4">
          <p className="text-sm text-status-danger">{error}</p>
        </div>
      )}

      {isSaving && (
        <div className="my-4 rounded-md bg-interactive-subtle p-4">
          <p className="text-sm text-content-link">Saving progress...</p>
        </div>
      )}

      <div className="mt-8">
        {currentStep === 0 && (
          <ProfileStep
            communityId={communityId}
            onNext={handleProfileNext}
            initialData={stepData.profile}
          />
        )}

        {currentStep === 1 && (
          <CompliancePreview
            communityType={communityType as 'condo_718' | 'hoa_720' | 'apartment'}
            categories={complianceCategories}
            onContinue={handleComplianceContinue}
            isLoading={isSaving}
          />
        )}
      </div>
    </div>
  );
}
