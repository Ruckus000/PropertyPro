'use client';

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { readOnboardingApiError } from '@/lib/onboarding/read-api-error';
import type {
  CondoWizardStepData,
} from '@/lib/onboarding/condo-wizard-types';

export interface SaveCondoStepInput {
  step: number;
  patch: Partial<CondoWizardStepData>;
}

export function useSaveCondoStep(
  communityId: number,
): UseMutationResult<void, Error, SaveCondoStepInput> {
  return useMutation<void, Error, SaveCondoStepInput>({
    mutationFn: async ({ step, patch }) => {
      const response = await fetch(`/api/v1/onboarding/condo?communityId=${communityId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, step, stepData: patch }),
      });
      if (!response.ok) {
        throw new Error(await readOnboardingApiError(response));
      }
    },
  });
}

export function useCompleteCondoOnboarding(
  communityId: number,
): UseMutationResult<void, Error, void> {
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const response = await fetch(`/api/v1/onboarding/condo?communityId=${communityId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, action: 'complete' }),
      });
      if (!response.ok) {
        throw new Error(await readOnboardingApiError(response));
      }
    },
  });
}
