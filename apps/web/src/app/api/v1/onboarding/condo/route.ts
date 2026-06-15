/**
 * Condo onboarding wizard API — 2-step flow
 *
 * GET    /api/v1/onboarding/condo  — load or initialize wizard state
 * PATCH  /api/v1/onboarding/condo  — save one wizard step
 * POST   /api/v1/onboarding/condo  — complete wizard
 *
 * Plan A1 drain #138. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`.
 */
import { runRoute } from '@propertypro/api-contract';
import { z } from 'zod';
import { createScopedClient, logAuditEvent } from '@propertypro/db';
import { getFeaturesForCommunity, type CommunityType } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { createChecklistItems } from '@/lib/services/onboarding-checklist-service';
import {
  type ProfileStepData,
  type CondoWizardStepData,
  normalizeCondoWizardStepData,
  normalizeCondoWizardStepPatch,
} from '@/lib/onboarding/condo-wizard-types';
import {
  requireMutationAuthorization,
  toIsoString,
  deriveNextStep,
  normalizeStepIndex,
  mergeStepData,
  updateCommunityProfile,
  getOrCreateWizardState,
  buildProfileFromCommunity,
  getCommunityForWizardSeed,
  updateWizardStateRow,
} from '@/lib/onboarding/wizard-common';
import {
  onboardingCondoGetContract,
  onboardingCondoPatchContract,
  onboardingCondoPostContract,
} from './contract';

const WIZARD_TYPE = 'condo';
const MAX_STEP_INDEX = 1;

const profileSchema = z.object({
  name: z.string().trim().min(1),
  addressLine1: z.string().trim().min(1),
  addressLine2: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value) => {
      if (value == null || value.length === 0) return null;
      return value;
    }),
  city: z.string().trim().min(1),
  state: z.string().trim().min(1),
  zipCode: z.string().trim().min(1),
  timezone: z.string().trim().refine(
    (tz) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Invalid IANA timezone (e.g., America/New_York, America/Chicago)' },
  ),
  logoPath: z.string().trim().optional().nullable(),
});

function requireCondoCommunity(communityType: CommunityType): void {
  const features = getFeaturesForCommunity(communityType);
  if (!features.hasCompliance) {
    throw new ForbiddenError('Condo onboarding is only available for condo/HOA communities');
  }
}

function validateStepPatch(step: number, rawStepData: unknown): Partial<CondoWizardStepData> {
  const normalized = normalizeCondoWizardStepPatch(rawStepData);

  if (step === 0) {
    if (normalized.profile === undefined) {
      throw new ValidationError('stepData.profile is required for step 0');
    }
    return { profile: profileSchema.parse(normalized.profile) as ProfileStepData };
  }

  return {};
}

function sectionLabelForStep(step: number): 'profile' | 'compliance_preview' {
  if (step === 0) return 'profile';
  return 'compliance_preview';
}

export const GET = withErrorHandler(
  runRoute(onboardingCondoGetContract, async ({ query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireCondoCommunity(membership.communityType);

    const scoped = createScopedClient(communityId);

    const community = await getCommunityForWizardSeed(scoped, communityId);
    const initialStepData = community
      ? { profile: buildProfileFromCommunity(community) }
      : undefined;

    const wizard = await getOrCreateWizardState(scoped, communityId, WIZARD_TYPE, initialStepData);
    const stepData = normalizeCondoWizardStepData(wizard.stepData);

    return {
      status: wizard.status,
      lastCompletedStep: wizard.lastCompletedStep,
      nextStep: deriveNextStep(wizard.lastCompletedStep, MAX_STEP_INDEX),
      stepData,
      completedAt: toIsoString(wizard.completedAt),
    };
  }),
);

export const PATCH = withErrorHandler(
  runRoute(onboardingCondoPatchContract, async ({ body, req }) => {
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    const actorUserId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireCondoCommunity(membership.communityType);
    requireMutationAuthorization(membership.role);
    await requireActiveSubscriptionForMutation(communityId);

    const step = normalizeStepIndex(body.step, body.currentStep);
    const stepPatch = validateStepPatch(step, body.stepData);

    const scoped = createScopedClient(communityId);
    const wizard = await getOrCreateWizardState(scoped, communityId, WIZARD_TYPE);

    const existingStepData = normalizeCondoWizardStepData(wizard.stepData);
    const mergedStepData = mergeStepData(existingStepData, stepPatch);

    if (step === 0 && mergedStepData.profile) {
      await updateCommunityProfile(scoped, communityId, mergedStepData.profile);
    }

    const existingLastStep = wizard.lastCompletedStep ?? -1;
    const lastCompletedStep = Math.max(existingLastStep, step);
    const status = wizard.status === 'skipped' ? 'in_progress' : wizard.status;

    await updateWizardStateRow(
      scoped,
      communityId,
      WIZARD_TYPE,
      {
        status,
        lastCompletedStep,
        stepData: mergedStepData,
        updatedAt: new Date(),
      },
    );

    await logAuditEvent({
      userId: actorUserId,
      action: 'update',
      resourceType: 'onboarding_wizard',
      resourceId: `${communityId}-${WIZARD_TYPE}`,
      communityId,
      newValues: {
        step,
        section: sectionLabelForStep(step),
        stepData: stepPatch,
      },
    });

    return {
      success: true,
      step,
      lastCompletedStep,
      nextStep: deriveNextStep(lastCompletedStep, MAX_STEP_INDEX),
      status,
      stepData: mergedStepData,
    };
  }),
);

export const POST = withErrorHandler(
  runRoute(onboardingCondoPostContract, async ({ body, req }) => {
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    const actorUserId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireCondoCommunity(membership.communityType);
    requireMutationAuthorization(membership.role);
    await requireActiveSubscriptionForMutation(communityId);

    const scoped = createScopedClient(communityId);
    const wizard = await getOrCreateWizardState(scoped, communityId, WIZARD_TYPE);

    if (wizard.status === 'completed') {
      return {
        success: true,
        status: 'completed' as const,
        completedAt: toIsoString(wizard.completedAt),
        noop: true,
      };
    }

    const now = new Date();
    const stepData = normalizeCondoWizardStepData(wizard.stepData);

    await updateWizardStateRow(
      scoped,
      communityId,
      WIZARD_TYPE,
      {
        status: 'completed',
        lastCompletedStep: MAX_STEP_INDEX,
        stepData,
        completedAt: now,
        updatedAt: now,
      },
    );

    await createChecklistItems(
      communityId,
      actorUserId,
      membership.role,
      membership.designation,
      membership.communityType as 'condo_718' | 'hoa_720' | 'apartment',
    );

    await logAuditEvent({
      userId: actorUserId,
      action: 'update',
      resourceType: 'onboarding_wizard',
      resourceId: `${communityId}-${WIZARD_TYPE}`,
      communityId,
      newValues: {
        status: 'completed',
        completedAt: now.toISOString(),
      },
    });

    return {
      success: true,
      status: 'completed' as const,
      completedAt: now.toISOString(),
    };
  }),
);
