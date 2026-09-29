/** Completed onboarding-wizard state so seeded communities skip first-run onboarding. */
import { sql } from '../../filters';
import { db } from './context';
import type { WizardType } from './types';

const maxStepsByWizardType: Record<WizardType, number> = {
  condo: 2,
  apartment: 3,
};

export async function seedWizardState(communityId: number, wizardType: WizardType): Promise<void> {
  const maxStep = maxStepsByWizardType[wizardType];
  await db.execute(sql`
    INSERT INTO onboarding_wizard_state (community_id, wizard_type, status, last_completed_step, step_data, completed_at)
    VALUES (${communityId}, ${wizardType}, 'completed', ${maxStep}, '{}', now())
    ON CONFLICT (community_id, wizard_type) DO NOTHING
  `);
}
