'use client';

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { readOnboardingApiError } from '@/lib/onboarding/read-api-error';
import type {
  WizardStepData,
} from '@/lib/onboarding/apartment-wizard-types';

export interface SaveApartmentStepInput {
  step: number;
  patch: Partial<WizardStepData>;
}

export function useSaveApartmentStep(
  communityId: number,
): UseMutationResult<void, Error, SaveApartmentStepInput> {
  return useMutation<void, Error, SaveApartmentStepInput>({
    mutationFn: async ({ step, patch }) => {
      const response = await fetch(`/api/v1/onboarding/apartment?communityId=${communityId}`, {
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

export function useCompleteApartmentOnboarding(
  communityId: number,
): UseMutationResult<void, Error, void> {
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const response = await fetch(`/api/v1/onboarding/apartment?communityId=${communityId}`, {
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
