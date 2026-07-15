'use client';

/**
 * Condo Onboarding Wizard — 2-step flow
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
    CondoWizardStatePayload,
    ProfileStepData,
    CondoWizardStepData,
} from '@/lib/onboarding/condo-wizard-types';
import { useSaveCondoStep, useCompleteCondoOnboarding } from '@/hooks/use-condo-onboarding';

interface CondoWizardProps {
    communityId: number;
    communityType: string;
    initialState?: CondoWizardStatePayload;
}

const STEPS: WizardStepDef[] = [
    { title: 'Community Profile', description: 'Tell us about your association.' },
    { title: 'Compliance Preview', description: 'Review what Florida requires of you.' },
];

const INTRO: WizardIntro = {
    title: "Let's get your community compliant.",
    subtitle: "A quick setup — then we'll map exactly what Florida law requires, no guesswork.",
    trust: 'Built for Florida §718 & §720 associations',
};

function mergeStepData(previous: CondoWizardStepData, patch: Partial<CondoWizardStepData>): CondoWizardStepData {
    return {
        ...previous,
        ...patch,
        completionMarkers: {
            ...(previous.completionMarkers ?? {}),
            ...(patch.completionMarkers ?? {}),
        },
    };
}

export function CondoWizard({ communityId, communityType, initialState }: CondoWizardProps) {
    const router = useRouter();
    const initialStep = Math.max(0, Math.min(initialState?.nextStep ?? 0, STEPS.length - 1));
    const [currentStep, setCurrentStep] = useState<number>(initialStep);
    const [stepData, setStepData] = useState<CondoWizardStepData>(initialState?.stepData ?? {});
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const saveStepMutation = useSaveCondoStep(communityId);
    const completeMutation = useCompleteCondoOnboarding(communityId);

    const complianceCategories = getComplianceTemplate(
        communityType as 'condo_718' | 'hoa_720' | 'apartment',
    ).map((item) => ({
        templateKey: item.templateKey,
        title: item.title,
        category: item.category,
        statuteReference: item.statuteReference,
    }));

    async function saveStep(step: number, patch: Partial<CondoWizardStepData>): Promise<void> {
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
