/**
 * Wizard state query helper — P2-38 closeout
 */

import { createScopedClient, onboardingWizardState } from '@propertypro/db';
import type { ApartmentWizardStatePayload } from '@/lib/onboarding/apartment-wizard-types';
import { normalizeWizardStepData } from '@/lib/onboarding/apartment-wizard-types';

const MAX_STEP_INDEX = 3;

function deriveNextStep(lastCompletedStep: number | null): number {
  if (lastCompletedStep == null) return 0;
  return Math.min(lastCompletedStep + 1, MAX_STEP_INDEX);
}

function toIsoString(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return null;
}

/**
 * Load apartment onboarding wizard state for a community.
 */
export async function loadWizardState(
  communityId: number,
): Promise<ApartmentWizardStatePayload | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.query(onboardingWizardState);
  const row = rows.find((candidate) => candidate['wizardType'] === 'apartment');

  if (!row) return null;

  const lastCompletedStep =
    typeof row['lastCompletedStep'] === 'number' ? (row['lastCompletedStep'] as number) : null;

  return {
    status: (row['status'] as ApartmentWizardStatePayload['status']) ?? 'in_progress',
    lastCompletedStep,
    nextStep: deriveNextStep(lastCompletedStep),
    stepData: normalizeWizardStepData(row['stepData']),
    completedAt: toIsoString(row['completedAt']),
  };
}
