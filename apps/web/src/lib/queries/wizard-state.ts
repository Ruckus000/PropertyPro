/**
 * Wizard state query helper — P2-38
 *
 * Loads the onboarding wizard state for a community.
 */

import { createScopedClient, onboardingWizardState } from '@propertypro/db';
import type { OnboardingWizardState } from '@propertypro/db';

/**
 * Load the apartment onboarding wizard state for a community.
 *
 * @param communityId - The community ID
 * @returns The wizard state record with currentStep (derived from lastCompletedStep), or null if not found
 */
export async function loadWizardState(
  communityId: number,
): Promise<(OnboardingWizardState & { currentStep: number }) | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.query(onboardingWizardState);
  const row = rows.find((r) => r.wizardType === 'apartment') as OnboardingWizardState | undefined;

  if (!row) return null;

  return {
    ...row,
    currentStep: (row.lastCompletedStep ?? 0) + 1,
  } as OnboardingWizardState & { currentStep: number };
}
