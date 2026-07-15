'use client';

/**
 * Apartment Onboarding Wizard — 2-step flow
 *
 * 0 Profile -> 1 Compliance Preview
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getComplianceTemplate } from '@propertypro/shared';
import { WizardShell, type WizardStepDef, type WizardIntro } from './wizard-shell';
import { ProfileStep } from './steps';
import { CompliancePreview } from './compliance-preview';
import type {
  ApartmentWizardStatePayload,
  ProfileStepData,
  WizardStepData,
} from '@/lib/onboarding/apartment-wizard-types';
import {
  useSaveApartmentStep,
  useCompleteApartmentOnboarding,
} from '@/hooks/use-apartment-onboarding';

interface ApartmentWizardProps {
  communityId: number;
  communityType: string;
  initialState?: ApartmentWizardStatePayload;
}

const STEPS: WizardStepDef[] = [
  { title: 'Community Profile', description: 'Tell us about your property.' },
  { title: 'Compliance Preview', description: 'Review your setup essentials.' },
];

const INTRO: WizardIntro = {
  title: "Let's get your community set up.",
  subtitle: 'A quick setup to launch your resident portal and start managing your property.',
  trust: 'Built for Florida property managers',
};

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

export function ApartmentWizard({ communityId, communityType, initialState }: ApartmentWizardProps) {
  const router = useRouter();
  const initialStep = Math.max(0, Math.min(initialState?.nextStep ?? 0, STEPS.length - 1));
  const [currentStep, setCurrentStep] = useState<number>(initialStep);
  const [stepData, setStepData] = useState<WizardStepData>(initialState?.stepData ?? {});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveStepMutation = useSaveApartmentStep(communityId);
  const completeMutation = useCompleteApartmentOnboarding(communityId);

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
      await saveStepMutation.mutateAsync({ step, patch });

      setStepData((previous) => mergeStepData(previous, patch));
      setCurrentStep(Math.min(step + 1, STEPS.length - 1));
    } finally {
      setIsSaving(false);
    }
  }

  async function completeWizard(): Promise<void> {
    setIsSaving(true);
    setError(null);

    try {
      await completeMutation.mutateAsync();
      router.push(`/dashboard?communityId=${communityId}`);
    } catch (completeError) {
      setError(
        completeError instanceof Error ? completeError.message : 'Failed to complete onboarding',
      );
    } finally {
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
    <WizardShell
      activeStep={Math.min(currentStep + 1, STEPS.length)}
      steps={STEPS}
      intro={INTRO}
      error={error}
    >
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
    </WizardShell>
  );
}
