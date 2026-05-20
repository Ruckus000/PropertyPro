'use client';

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type {
  CondoWizardStepData,
} from '@/lib/onboarding/condo-wizard-types';

interface ApiErrorResponse {
  error?: string | { code?: string; message?: string };
}

// Documented exception to the requestJson rule: the route's error envelope is
// `{ error: string | { message } }` (string form preserved verbatim from the
// pre-drain component) and the parsed message is rendered verbatim in the
// wizard's error banner; requestJson only handles `error.message`. Success
// responses are never parsed by the wizard — only `response.ok` is checked.
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
        throw new Error(await readApiError(response));
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
        throw new Error(await readApiError(response));
      }
    },
  });
}
