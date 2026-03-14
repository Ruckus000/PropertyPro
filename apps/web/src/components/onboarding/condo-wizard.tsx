'use client';

/**
 * Condo Onboarding Wizard — P2-39
 *
 * 4-step flow:
 * 0 Statutory -> 1 Profile -> 2 Branding -> 3 Units
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProgressIndicator } from './progress-indicator';
import { StatutoryDocumentsStep } from './steps/statutory-documents-step';
import { ProfileStep, UnitsStep, BrandingStep } from './steps';
import type { UnitData, BrandingStepData } from './steps';
import type {
    CondoWizardStatePayload,
    StatutoryStepData,
    ProfileStepData,
    CondoWizardStepData,
} from '@/lib/onboarding/condo-wizard-types';

interface CondoWizardProps {
    communityId: number;
    communityType: string;
    initialState?: CondoWizardStatePayload;
}

const STEP_TITLES = ['Statutory Documents', 'Community Profile', 'Branding', 'Unit Roster'];

interface ApiErrorResponse {
    error?: string | { code?: string; message?: string };
}

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

export function CondoWizard({ communityId, communityType, initialState }: CondoWizardProps) {
    const router = useRouter();
    const initialStep = Math.max(0, Math.min(initialState?.nextStep ?? 0, STEP_TITLES.length - 1));
    const [currentStep, setCurrentStep] = useState<number>(initialStep);
    const [stepData, setStepData] = useState<CondoWizardStepData>(initialState?.stepData ?? {});
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function saveStep(step: number, patch: Partial<CondoWizardStepData>): Promise<void> {
        setIsSaving(true);
        setError(null);

        try {
            const response = await fetch(`/api/v1/onboarding/condo?communityId=${communityId}`, {
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
            const response = await fetch(`/api/v1/onboarding/condo?communityId=${communityId}`, {
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

            router.push(`/dashboard?communityId=${communityId}`);
            return;
        } catch (completeError) {
            setError(
                completeError instanceof Error ? completeError.message : 'Failed to complete onboarding',
            );
            setIsSaving(false);
        }
    }

    async function handleStatutoryNext(data: StatutoryStepData): Promise<void> {
        try {
            await saveStep(0, { statutory: data });
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Failed to save statutory step');
            setIsSaving(false);
        }
    }

    async function handleProfileNext(data: ProfileStepData): Promise<void> {
        try {
            await saveStep(1, { profile: data });
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Failed to save profile step');
            setIsSaving(false);
        }
    }

    async function handleBrandingNext(data: BrandingStepData): Promise<void> {
        try {
            await saveStep(2, { branding: data });
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Failed to save branding step');
            setIsSaving(false);
        }
    }

    async function handleUnitsNext(units: UnitData[]): Promise<void> {
        try {
            await saveStep(3, { units });
            await completeWizard('complete');
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Failed to save units step');
            setIsSaving(false);
        }
    }

    async function handleSkipWizard(): Promise<void> {
        await completeWizard('skip');
    }

    return (
        <div className="mx-auto max-w-4xl px-6 py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Welcome to PropertyPro</h1>
                <p className="mt-2 text-gray-600">Set up your community compliance and profile in four quick steps.</p>
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
                    <StatutoryDocumentsStep
                        communityId={communityId}
                        onNext={handleStatutoryNext}
                        initialData={stepData.statutory}
                    />
                )}

                {currentStep === 1 && (
                    <ProfileStep
                        communityId={communityId}
                        onNext={handleProfileNext}
                        initialData={stepData.profile}
                    />
                )}

                {currentStep === 2 && (
                    <BrandingStep
                        onNext={handleBrandingNext}
                        onBack={() => setCurrentStep(1)}
                        initialData={stepData.branding}
                    />
                )}

                {currentStep === 3 && (
                    <UnitsStep
                        onNext={handleUnitsNext}
                        onBack={() => setCurrentStep(2)}
                        initialData={stepData.units}
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
