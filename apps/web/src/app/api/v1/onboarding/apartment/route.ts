/**
 * Apartment onboarding wizard API — P2-38 closeout
 *
 * GET    /api/v1/onboarding/apartment  — load or initialize wizard state
 * PATCH  /api/v1/onboarding/apartment  — save one wizard step
 * POST   /api/v1/onboarding/apartment  — complete or skip wizard
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  communities,
  createScopedClient,
  logAuditEvent,
  onboardingWizardState,
  units,
  users,
} from '@propertypro/db';
import { and, eq } from '@propertypro/db/filters';
import { getFeaturesForCommunity, type CommunityType } from '@propertypro/shared';
import { ALLOWED_FONTS } from '@propertypro/theme';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { updateBrandingForCommunity } from '@/lib/api/branding';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import {
  createOnboardingResident,
  createOnboardingInvitation,
} from '@/lib/services/onboarding-service';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import {
  type InviteStepData,
  type ProfileStepData,
  type RulesStepData,
  type UnitDraftData,
  type WizardStepData,
  normalizeWizardStepData,
  normalizeWizardStepPatch,
} from '@/lib/onboarding/apartment-wizard-types';
import {
  type ScopedClient,
  type WizardStatus,
  requireMutationAuthorization,
  isUniqueViolation,
  toIsoString,
  deriveNextStep,
  normalizeStepIndex,
  normalizeAction,
  mergeStepData,
  updateCommunityProfile,
  getOrCreateWizardState,
} from '@/lib/onboarding/wizard-common';

const WIZARD_TYPE = 'apartment';
const MAX_STEP_INDEX = 4; // 0 Profile, 1 Branding, 2 Units, 3 Rules, 4 Invite

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const allowedFontsSet = new Set<string>(ALLOWED_FONTS);

const brandingSchema = z.object({
  presetId: z.string().nullable().optional(),
  primaryColor: z.string().regex(HEX_RE, 'Must be a valid hex color'),
  secondaryColor: z.string().regex(HEX_RE, 'Must be a valid hex color'),
  accentColor: z.string().regex(HEX_RE, 'Must be a valid hex color'),
  fontHeading: z.string().refine((v) => allowedFontsSet.has(v), 'Invalid font'),
  fontBody: z.string().refine((v) => allowedFontsSet.has(v), 'Invalid font'),
});

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

const unitSchema = z.object({
  unitNumber: z.string().trim().min(1),
  floor: z.number().int().nullable().optional(),
  bedrooms: z.number().int().nullable().optional(),
  bathrooms: z.number().int().nullable().optional(),
  sqft: z.number().int().nullable().optional(),
  rentAmount: z
    .union([
      z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'Must be a decimal with up to 2 places'),
      z.number(),
    ])
    .nullable()
    .optional()
    .transform((value) => {
      if (value == null) return null;
      return typeof value === 'number' ? value.toFixed(2) : value;
    }),
});

const rulesSchema = z.object({
  documentId: z.number().int().positive(),
  path: z.string().trim().min(1),
});

const inviteSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  fullName: z.string().trim().min(1),
  unitNumber: z.string().trim().min(1),
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
    message: 'step (0-4) or currentStep (1-5) is required',
  });

const completeWizardSchema = z.object({
  communityId: z.number().int().positive(),
  action: z.enum(['complete', 'skip']).optional(),
  skip: z.boolean().optional(),
});

function requireApartmentCommunity(communityType: CommunityType): void {
  const features = getFeaturesForCommunity(communityType);
  if (!features.hasLeaseTracking) {
    throw new ForbiddenError('Apartment onboarding is only available for apartment communities');
  }
}

async function persistStepData(
  scoped: ScopedClient,
  communityId: number,
  stepData: WizardStepData,
): Promise<void> {
  await scoped.update(
    onboardingWizardState,
    {
      stepData,
      updatedAt: new Date(),
    },
    and(
      eq(onboardingWizardState.communityId, communityId),
      eq(onboardingWizardState.wizardType, WIZARD_TYPE),
    ),
  );
}

function validateStepPatch(step: number, rawStepData: unknown): Partial<WizardStepData> {
  const normalized = normalizeWizardStepPatch(rawStepData);

  if (step === 0) {
    if (normalized.profile === undefined) {
      throw new ValidationError('stepData.profile is required for step 0');
    }
    return { profile: profileSchema.parse(normalized.profile) as ProfileStepData };
  }

  if (step === 1) {
    if (normalized.branding === undefined) {
      throw new ValidationError('stepData.branding is required for step 1');
    }
    return { branding: brandingSchema.parse(normalized.branding) };
  }

  if (step === 2) {
    if (normalized.units === undefined) {
      throw new ValidationError('stepData.units is required for step 2');
    }
    const parsedUnits = z.array(unitSchema).min(1).parse(normalized.units) as UnitDraftData[];
    return { units: parsedUnits };
  }

  if (step === 3) {
    if (normalized.rules === undefined) {
      throw new ValidationError('stepData.rules is required for step 3 (object or null)');
    }
    return { rules: z.union([rulesSchema, z.null()]).parse(normalized.rules) as RulesStepData | null };
  }

  if (normalized.invite === undefined) {
    throw new ValidationError('stepData.invite is required for step 4 (object or null)');
  }

  return {
    invite: z.union([inviteSchema, z.null()]).parse(normalized.invite) as InviteStepData | null,
  };
}

function sectionLabelForStep(step: number): 'profile' | 'branding' | 'units' | 'rules' | 'invite' {
  if (step === 0) return 'profile';
  if (step === 1) return 'branding';
  if (step === 2) return 'units';
  if (step === 3) return 'rules';
  return 'invite';
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
  const wizard = await getOrCreateWizardState(scoped, communityId, WIZARD_TYPE);

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

  if (step === 1 && mergedStepData.branding) {
    await updateBrandingForCommunity(communityId, {
      primaryColor: mergedStepData.branding.primaryColor,
      secondaryColor: mergedStepData.branding.secondaryColor,
      accentColor: mergedStepData.branding.accentColor,
      fontHeading: mergedStepData.branding.fontHeading,
      fontBody: mergedStepData.branding.fontBody,
    });
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

  const action = normalizeAction(parseResult.data.action, parseResult.data.skip);

  const scoped = createScopedClient(communityId);
  const wizard = await getOrCreateWizardState(scoped, communityId, WIZARD_TYPE);

  if (action === 'skip') {
    if (wizard.status !== 'completed') {
      await scoped.update(
        onboardingWizardState,
        {
          status: 'skipped',
          completedAt: null,
          updatedAt: new Date(),
        },
        and(
          eq(onboardingWizardState.communityId, communityId),
          eq(onboardingWizardState.wizardType, WIZARD_TYPE),
        ),
      );
    }

    await logAuditEvent({
      userId: actorUserId,
      action: 'update',
      resourceType: 'onboarding_wizard',
      resourceId: `${communityId}-${WIZARD_TYPE}`,
      communityId,
      newValues: { status: wizard.status === 'completed' ? 'completed' : 'skipped' },
    });

    return NextResponse.json({
      data: {
        success: true,
        status: wizard.status === 'completed' ? 'completed' : 'skipped',
      },
    });
  }

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
  const completionMarkers = {
    ...(stepData.completionMarkers ?? {}),
  };

  if (!completionMarkers.unitsCreated) {
    const draftUnits = z.array(unitSchema).min(1).parse(stepData.units ?? []) as UnitDraftData[];

    const submittedUnitNumbers = draftUnits.map((unit) => unit.unitNumber.trim().toLowerCase());
    const uniqueSubmitted = new Set(submittedUnitNumbers);

    if (submittedUnitNumbers.length !== uniqueSubmitted.size) {
      throw new ValidationError('Duplicate unit numbers detected in submission.', {
        fields: [{ field: 'units', message: 'Contains duplicate unit numbers' }],
      });
    }

    const existingUnits = await scoped.query(units);
    const existingNumbers = new Set(
      existingUnits.map((unit) => ((unit['unitNumber'] as string) ?? '').trim().toLowerCase()),
    );

    const conflicts = submittedUnitNumbers.filter((number) => existingNumbers.has(number));
    if (conflicts.length > 0) {
      throw new ValidationError(`Unit numbers already exist in this community: ${conflicts.join(', ')}`, {
        fields: [{ field: 'units', message: 'Contains existing unit numbers' }],
      });
    }

    const unitData = draftUnits.map(unit => ({
      communityId,
      unitNumber: unit.unitNumber,
      floor: unit.floor ?? null,
      bedrooms: unit.bedrooms ?? null,
      bathrooms: unit.bathrooms ?? null,
      sqft: unit.sqft ?? null,
      rentAmount: unit.rentAmount ?? null,
    }));
    await scoped.insert(units, unitData);

    completionMarkers.unitsCreated = true;
    stepData.completionMarkers = completionMarkers;
    await persistStepData(scoped, communityId, stepData);
  }

  if (!completionMarkers.residentCreated && stepData.invite) {
    const invite = inviteSchema.parse(stepData.invite) as InviteStepData;

    const unitRows = await scoped.query(units);
    const desiredUnitNumber = invite.unitNumber.trim().toLowerCase();
    const matchedUnit = unitRows.find(
      (row) => ((row['unitNumber'] as string) ?? '').trim().toLowerCase() === desiredUnitNumber,
    );

    if (!matchedUnit) {
      throw new ValidationError('Invite unit number does not exist in this community', {
        fields: [{ field: 'invite.unitNumber', message: 'Unknown unit number' }],
      });
    }

    await createOnboardingResident({
      communityId,
      email: invite.email,
      fullName: invite.fullName,
      phone: null,
      role: 'resident',
      unitId: matchedUnit['id'] as number,
      actorUserId,
      communityType: membership.communityType,
      isUnitOwner: false,
    });

    completionMarkers.residentCreated = true;
    stepData.completionMarkers = completionMarkers;
    await persistStepData(scoped, communityId, stepData);
  }

  if (!completionMarkers.inviteCreated && stepData.invite) {
    const invite = inviteSchema.parse(stepData.invite) as InviteStepData;
    const allUsers = await scoped.query(users);
    const targetUser = allUsers.find(
      (row) => ((row['email'] as string) ?? '').toLowerCase() === invite.email.toLowerCase(),
    );

    if (!targetUser) {
      throw new NotFoundError('Resident user was not found while creating invitation');
    }

    await createOnboardingInvitation({
      communityId,
      userId: targetUser['id'] as string,
      ttlDays: 7,
      actorUserId,
    });

    completionMarkers.inviteCreated = true;
    stepData.completionMarkers = completionMarkers;
    await persistStepData(scoped, communityId, stepData);
  }

  if (stepData.profile) {
    const profile = profileSchema.parse(stepData.profile) as ProfileStepData;
    await updateCommunityProfile(scoped, communityId, profile);
  }

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

  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'onboarding_wizard',
    resourceId: `${communityId}-${WIZARD_TYPE}`,
    communityId,
    newValues: {
      status: 'completed',
      completedAt: now.toISOString(),
      completionMarkers,
      hasRulesDocument: stepData.rules != null,
      hasInvite: stepData.invite != null,
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
