/**
 * Wizard state query helper — P2-38 closeout
 */

import { createScopedClient, onboardingWizardState } from '@propertypro/db';
import type { ApartmentWizardStatePayload } from '@/lib/onboarding/apartment-wizard-types';
import { normalizeWizardStepData } from '@/lib/onboarding/apartment-wizard-types';

function deriveNextStep(lastCompletedStep: number | null, maxStepIndex: number): number {
  if (lastCompletedStep == null) return 0;
  return Math.min(lastCompletedStep + 1, maxStepIndex);
}

function getMaxStepIndex(wizardType: string): number {
  if (wizardType === 'condo') {
    return 2;
  }

  return 3;
}

function toIsoString(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return null;
}

/**
 * Load onboarding wizard state for a community.
 */
export async function loadWizardState<T = ApartmentWizardStatePayload>(
  communityId: number,
  wizardType: string = 'apartment',
): Promise<T | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.query(onboardingWizardState);
  const row = rows.find((candidate) => candidate['wizardType'] === wizardType);

  if (!row) return null;

  const lastCompletedStep =
    typeof row['lastCompletedStep'] === 'number' ? (row['lastCompletedStep'] as number) : null;
  const maxStepIndex = getMaxStepIndex(wizardType);

  let stepDataPayload;
  if (wizardType === 'condo') {
    const { normalizeCondoWizardStepData } = await import('@/lib/onboarding/condo-wizard-types');
    stepDataPayload = normalizeCondoWizardStepData(row['stepData']);
  } else {
    stepDataPayload = normalizeWizardStepData(row['stepData']);
  }

  return {
    status: (row['status'] as ApartmentWizardStatePayload['status']) ?? 'in_progress',
    lastCompletedStep,
    nextStep: deriveNextStep(lastCompletedStep, maxStepIndex),
    stepData: stepDataPayload,
    completedAt: toIsoString(row['completedAt']),
  } as unknown as T;
}
