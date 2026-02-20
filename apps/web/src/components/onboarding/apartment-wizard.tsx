'use client';

/**
 * Apartment Onboarding Wizard — P2-38
 *
 * Main orchestrator component for the apartment onboarding flow.
 * Manages step progression, state persistence, and completion.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ProgressIndicator } from './progress-indicator';
import { ProfileStep, UnitsStep, InviteStep } from './steps';
import type { ProfileData, UnitData, InviteData } from './steps';

interface WizardState {
  currentStep: number;
  status: 'in_progress' | 'completed' | 'skipped';
  stepData: {
    profile?: ProfileData;
    unitsTable?: UnitData[];
    inviteEmail?: InviteData | null;
    completionMarkers?: {
      unitsCreated: boolean;
      residentCreated: boolean;
      inviteCreated: boolean;
    };
  };
}

interface ApartmentWizardProps {
  communityId: number;
  initialState?: WizardState;
}

const STEP_TITLES = ['Profile', 'Units', 'Invite'];

export function ApartmentWizard({ communityId, initialState }: ApartmentWizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(initialState?.currentStep ?? 1);
  const [stepData, setStepData] = useState(initialState?.stepData ?? {});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-save on step change
  useEffect(() => {
    if (currentStep > 1) {
      saveProgress();
    }
  }, [currentStep]);

  const saveProgress = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/onboarding/apartment?communityId=${communityId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            communityId,
            currentStep,
            stepData,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save progress');
      }
    } catch (err) {
      console.error('Failed to save wizard progress:', err);
      setError(err instanceof Error ? err.message : 'Failed to save progress');
    } finally {
      setIsSaving(false);
    }
  };

  const handleComplete = async (skip: boolean = false) => {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/onboarding/apartment?communityId=${communityId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            communityId,
            skip,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to complete onboarding');
      }

      // Redirect to apartment dashboard
      router.push(`/dashboard/apartment?communityId=${communityId}`);
    } catch (err) {
      console.error('Failed to complete wizard:', err);
      setError(err instanceof Error ? err.message : 'Failed to complete onboarding');
      setIsSaving(false);
    }
  };

  const handleProfileNext = (data: ProfileData) => {
    setStepData((prev) => ({ ...prev, profile: data }));
    setCurrentStep(2);
  };

  const handleUnitsNext = (units: UnitData[]) => {
    setStepData((prev) => ({ ...prev, unitsTable: units }));
    setCurrentStep(3);
  };

  const handleInviteNext = (data: InviteData | null) => {
    setStepData((prev) => ({ ...prev, inviteEmail: data }));
    // Complete wizard with all data
    handleComplete(false);
  };

  const handleSkip = () => {
    handleComplete(true);
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Welcome to PropertyPro</h1>
        <p className="mt-2 text-gray-600">
          Let's set up your community in just a few steps
        </p>
      </div>

      <ProgressIndicator currentStep={currentStep} stepTitles={STEP_TITLES} />

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
        {currentStep === 1 && (
          <ProfileStep onNext={handleProfileNext} initialData={stepData.profile} />
        )}

        {currentStep === 2 && (
          <UnitsStep
            onNext={handleUnitsNext}
            onBack={() => setCurrentStep(1)}
            initialData={stepData.unitsTable}
          />
        )}

        {currentStep === 3 && (
          <InviteStep
            onNext={handleInviteNext}
            onBack={() => setCurrentStep(2)}
            onSkip={handleSkip}
          />
        )}
      </div>

      <div className="mt-8 border-t pt-6">
        <button
          onClick={handleSkip}
          disabled={isSaving}
          className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
        >
          Skip setup and go to dashboard →
        </button>
      </div>
    </div>
  );
}
