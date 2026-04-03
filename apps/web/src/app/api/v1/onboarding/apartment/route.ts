/**
 * Apartment onboarding wizard API — 2-step flow
 *
 * GET    /api/v1/onboarding/apartment  — load or initialize wizard state
 * PATCH  /api/v1/onboarding/apartment  — save one wizard step
 * POST   /api/v1/onboarding/apartment  — complete wizard
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  communities,
  createScopedClient,
  logAuditEvent,
  onboardingWizardState,
} from '@propertypro/db';
import { and, eq } from '@propertypro/db/filters';
import { getFeaturesForCommunity, type CommunityType } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { createChecklistItems } from '@/lib/services/onboarding-checklist-service';
import {
  type ProfileStepData,
  type WizardStepData,
  normalizeWizardStepData,
  normalizeWizardStepPatch,
} from '@/lib/onboarding/apartment-wizard-types';
import {
  requireMutationAuthorization,
  toIsoString,
  deriveNextStep,
  normalizeStepIndex,
  mergeStepData,
  updateCommunityProfile,
  getOrCreateWizardState,
  buildProfileFromCommunity,
} from '@/lib/onboarding/wizard-common';

const WIZARD_TYPE = 'apartment';
const MAX_STEP_INDEX = 1; // 0 Profile, 1 Compliance Preview

const communityIdSchema = z.coerce.number().int().positive();

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

const patchWizardSchema = z
  .object({
    communityId: z.number().int().positive(),
    step: z.number().int().min(0).max(MAX_STEP_INDEX).optional(),
    currentStep: z.number().int().min(1).max(MAX_STEP_INDEX + 1).optional(),
    stepData: z.unknown(),
  })
  .refine((payload) => payload.step !== undefined || payload.currentStep !== undefined, {
    path: ['step'],
    message: 'step (0-1) or currentStep (1-2) is required',
  });

const completeWizardSchema = z.object({
  communityId: z.number().int().positive(),
  action: z.enum(['complete']).optional(),
});

function requireApartmentCommunity(communityType: CommunityType): void {
  const features = getFeaturesForCommunity(communityType);
  if (!features.hasLeaseTracking) {
    throw new ForbiddenError('Apartment onboarding is only available for apartment communities');
  }
}

function validateStepPatch(step: number, rawStepData: unknown): Partial<WizardStepData> {
  const normalized = normalizeWizardStepPatch(rawStepData);

  if (step === 0) {
    if (normalized.profile === undefined) {
      throw new ValidationError('stepData.profile is required for step 0');
    }
    return { profile: profileSchema.parse(normalized.profile) as ProfileStepData };
  }

  // Step 1 (compliance preview) has no data to save
  return {};
}

function sectionLabelForStep(step: number): 'profile' | 'compliance_preview' {
  if (step === 0) return 'profile';
  return 'compliance_preview';
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const { searchParams } = new URL(req.url);
  const rawCommunityId = searchParams.get('communityId');

  const communityIdResult = communityIdSchema.safeParse(rawCommunityId);
  if (!communityIdResult.success) {
    throw new ValidationError('Invalid or missing communityId query parameter', {
      fields: formatZodErrors(communityIdResult.error),
    });
  }

  const communityId = resolveEffectiveCommunityId(req, communityIdResult.data);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requireApartmentCommunity(membership.communityType);

  const scoped = createScopedClient(communityId);

  // Pre-populate profile step from existing community data (collected during signup)
  const communityRows = await scoped.query(communities);
  const community = communityRows.find((row) => row['id'] === communityId);
  const initialStepData = community
    ? { profile: buildProfileFromCommunity(community) }
    : undefined;

  const wizard = await getOrCreateWizardState(scoped, communityId, WIZARD_TYPE, initialStepData);

  const stepData = normalizeWizardStepData(wizard.stepData);

  return NextResponse.json({
    data: {
      status: wizard.status,
      lastCompletedStep: wizard.lastCompletedStep,
      nextStep: deriveNextStep(wizard.lastCompletedStep, MAX_STEP_INDEX),
      stepData,
      completedAt: toIsoString(wizard.completedAt),
    },
  });
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const parseResult = patchWizardSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Validation failed', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = resolveEffectiveCommunityId(req, parseResult.data.communityId);
  const actorUserId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireApartmentCommunity(membership.communityType);
  requireMutationAuthorization(membership.role);
  await requireActiveSubscriptionForMutation(communityId);

  const step = normalizeStepIndex(parseResult.data.step, parseResult.data.currentStep);
  const stepPatch = validateStepPatch(step, parseResult.data.stepData);

  const scoped = createScopedClient(communityId);
  const wizard = await getOrCreateWizardState(scoped, communityId, WIZARD_TYPE);

  const existingStepData = normalizeWizardStepData(wizard.stepData);
  const mergedStepData = mergeStepData(existingStepData, stepPatch);

  if (step === 0 && mergedStepData.profile) {
    await updateCommunityProfile(scoped, communityId, mergedStepData.profile);
  }

  const existingLastStep = wizard.lastCompletedStep ?? -1;
  const lastCompletedStep = Math.max(existingLastStep, step);
  const status = wizard.status === 'skipped' ? 'in_progress' : wizard.status;

  await scoped.update(
    onboardingWizardState,
    {
      status,
      lastCompletedStep,
      stepData: mergedStepData,
      updatedAt: new Date(),
    },
    and(
      eq(onboardingWizardState.communityId, communityId),
      eq(onboardingWizardState.wizardType, WIZARD_TYPE),
    ),
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

  return NextResponse.json({
    data: {
      success: true,
      step,
      lastCompletedStep,
      nextStep: deriveNextStep(lastCompletedStep, MAX_STEP_INDEX),
      status,
      stepData: mergedStepData,
    },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const parseResult = completeWizardSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Validation failed', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = resolveEffectiveCommunityId(req, parseResult.data.communityId);
  const actorUserId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireApartmentCommunity(membership.communityType);
  requireMutationAuthorization(membership.role);
  await requireActiveSubscriptionForMutation(communityId);

  const scoped = createScopedClient(communityId);
  const wizard = await getOrCreateWizardState(scoped, communityId, WIZARD_TYPE);

  if (wizard.status === 'completed') {
    return NextResponse.json({
      data: {
        success: true,
        status: 'completed',
        completedAt: toIsoString(wizard.completedAt),
        noop: true,
      },
    });
  }

  const now = new Date();
  const stepData = normalizeWizardStepData(wizard.stepData);

  // Mark wizard as completed
  await scoped.update(
    onboardingWizardState,
    {
      status: 'completed',
      lastCompletedStep: MAX_STEP_INDEX,
      stepData,
      completedAt: now,
      updatedAt: now,
    },
    and(
      eq(onboardingWizardState.communityId, communityId),
      eq(onboardingWizardState.wizardType, WIZARD_TYPE),
    ),
  );

  // Create checklist items for the post-onboarding checklist
  await createChecklistItems(
    communityId,
    actorUserId,
    membership.role,
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

  return NextResponse.json(
    {
      data: {
        success: true,
        status: 'completed',
        completedAt: now.toISOString(),
      },
    },
    { status: 201 },
  );
});
