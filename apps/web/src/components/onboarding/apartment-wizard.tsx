'use client';

/**
 * Apartment Onboarding Wizard — P2-38 closeout
 *
 * 4-step flow:
 * 0 Profile -> 1 Units -> 2 Rules -> 3 Invite
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProgressIndicator } from './progress-indicator';
import { ProfileStep, UnitsStep, RulesStep, InviteStep } from './steps';
import type { InviteData, UnitData } from './steps';
import type {
  ApartmentWizardStatePayload,
  ProfileStepData,
  RulesStepData,
  WizardStepData,
} from '@/lib/onboarding/apartment-wizard-types';

interface ApartmentWizardProps {
  communityId: number;
  initialState?: ApartmentWizardStatePayload;
}

const STEP_TITLES = ['Profile', 'Units', 'Rules', 'Invite'];

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

export function ApartmentWizard({ communityId, initialState }: ApartmentWizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<number>(initialState?.nextStep ?? 0);
  const [stepData, setStepData] = useState<WizardStepData>(initialState?.stepData ?? {});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function completeWizard(action: 'complete' | 'skip'): Promise<void> {
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
          action,
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      router.push(`/dashboard/apartment?communityId=${communityId}`);
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

  async function handleUnitsNext(units: UnitData[]): Promise<void> {
    try {
      await saveStep(1, { units });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save units step');
      setIsSaving(false);
    }
  }

  async function handleRulesNext(rules: RulesStepData | null): Promise<void> {
    try {
      await saveStep(2, { rules });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save rules step');
      setIsSaving(false);
    }
  }

  async function handleInviteSubmit(data: InviteData | null): Promise<void> {
    try {
      await saveStep(3, { invite: data });
      await completeWizard('complete');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save invite step');
      setIsSaving(false);
    }
  }

  async function handleSkipInvite(): Promise<void> {
    await handleInviteSubmit(null);
  }

  async function handleSkipWizard(): Promise<void> {
    await completeWizard('skip');
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Welcome to PropertyPro</h1>
        <p className="mt-2 text-gray-600">Set up your apartment community in four quick steps.</p>
      </div>

      <ProgressIndicator currentStep={Math.min(currentStep + 1, STEP_TITLES.length)} stepTitles={STEP_TITLES} />

      {error && (
        <div className="my-4 rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {isSaving && (
        <div className="my-4 rounded-md bg-blue-50 p-4">
          <p className="text-sm text-blue-800">Saving progress...</p>
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
          <UnitsStep
            onNext={handleUnitsNext}
            onBack={() => setCurrentStep(0)}
            initialData={stepData.units}
          />
        )}

        {currentStep === 2 && (
          <RulesStep
            communityId={communityId}
            onNext={handleRulesNext}
            onBack={() => setCurrentStep(1)}
            initialData={stepData.rules ?? null}
          />
        )}

        {currentStep === 3 && (
          <InviteStep
            units={stepData.units ?? []}
            initialData={stepData.invite ?? null}
            onNext={handleInviteSubmit}
            onBack={() => setCurrentStep(2)}
            onSkip={handleSkipInvite}
          />
        )}
      </div>

      <div className="mt-8 border-t pt-6">
        <button
          type="button"
          onClick={handleSkipWizard}
          disabled={isSaving}
          className="text-sm text-gray-600 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Skip entire setup and go to dashboard
        </button>
      </div>
    </div>
  );
}
