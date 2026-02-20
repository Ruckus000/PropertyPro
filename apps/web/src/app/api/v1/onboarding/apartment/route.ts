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
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/api/errors';
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
  type WizardStatus,
  type WizardStepData,
  normalizeWizardStepData,
  normalizeWizardStepPatch,
} from '@/lib/onboarding/apartment-wizard-types';

const WIZARD_TYPE = 'apartment';
const MAX_STEP_INDEX = 3;

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
    message: 'step (0-3) or currentStep (1-4) is required',
  });

const completeWizardSchema = z.object({
  communityId: z.number().int().positive(),
  action: z.enum(['complete', 'skip']).optional(),
  skip: z.boolean().optional(),
});

type ScopedClient = ReturnType<typeof createScopedClient>;

type WizardRow = {
  status: WizardStatus;
  lastCompletedStep: number | null;
  stepData: unknown;
  completedAt: Date | string | null;
};

function requireMutationAuthorization(role: string): void {
  if (!['site_manager', 'property_manager_admin'].includes(role)) {
    throw new ForbiddenError('Only site managers and property manager admins can modify wizard state');
  }
}

function requireApartmentCommunity(communityType: string): void {
  const features = getFeaturesForCommunity(communityType as Parameters<typeof getFeaturesForCommunity>[0]);
  if (!features.hasLeaseTracking) {
    throw new ForbiddenError('Apartment onboarding is only available for apartment communities');
  }
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const maybeCode = (error as { code?: unknown }).code;
  return maybeCode === '23505';
}

function toIsoString(value: Date | string | null): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return value.toISOString();
}

function deriveNextStep(lastCompletedStep: number | null): number {
  if (lastCompletedStep == null) return 0;
  return Math.min(lastCompletedStep + 1, MAX_STEP_INDEX);
}

function normalizeStepIndex(step: number | undefined, currentStep: number | undefined): number {
  if (step !== undefined) return step;
  if (currentStep === undefined) {
    throw new ValidationError('step or currentStep is required');
  }
  return currentStep - 1;
}

function normalizeAction(action: 'complete' | 'skip' | undefined, skip: boolean | undefined): 'complete' | 'skip' {
  if (action) return action;
  return skip ? 'skip' : 'complete';
}

function mergeStepData(existing: WizardStepData, patch: Partial<WizardStepData>): WizardStepData {
  const merged: WizardStepData = {
    ...existing,
    ...patch,
  };

  if (existing.completionMarkers || patch.completionMarkers) {
    merged.completionMarkers = {
      ...(existing.completionMarkers ?? {}),
      ...(patch.completionMarkers ?? {}),
    };
  }

  return merged;
}

async function updateCommunityProfile(
  scoped: ScopedClient,
  communityId: number,
  profile: ProfileStepData,
): Promise<void> {
  const updatePayload = {
    name: profile.name,
    addressLine1: profile.addressLine1,
    addressLine2: profile.addressLine2 ?? null,
    city: profile.city,
    state: profile.state,
    zipCode: profile.zipCode,
    timezone: profile.timezone,
    logoPath: profile.logoPath ?? null,
    updatedAt: new Date(),
  };

  await scoped.update(communities, updatePayload, eq(communities.id, communityId));
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

function parseWizardRow(row: Record<string, unknown>): WizardRow {
  return {
    status: (row['status'] as WizardStatus) ?? 'in_progress',
    lastCompletedStep:
      typeof row['lastCompletedStep'] === 'number' ? (row['lastCompletedStep'] as number) : null,
    stepData: row['stepData'] ?? {},
    completedAt: (row['completedAt'] as Date | string | null | undefined) ?? null,
  };
}

async function getOrCreateWizardState(
  scoped: ScopedClient,
  communityId: number,
): Promise<WizardRow> {
  const rows = await scoped.query(onboardingWizardState);
  const existing = rows.find((row) => row['wizardType'] === WIZARD_TYPE);

  if (existing) {
    return parseWizardRow(existing);
  }

  try {
    const inserted = await scoped.insert(onboardingWizardState, {
      communityId,
      wizardType: WIZARD_TYPE,
      status: 'in_progress',
      lastCompletedStep: null,
      stepData: {},
    });

    if (inserted[0]) {
      return parseWizardRow(inserted[0]);
    }
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
  }

  const retryRows = await scoped.query(onboardingWizardState);
  const retry = retryRows.find((row) => row['wizardType'] === WIZARD_TYPE);
  if (!retry) {
    throw new NotFoundError('Failed to load wizard state after initialization');
  }

  return parseWizardRow(retry);
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
    if (normalized.units === undefined) {
      throw new ValidationError('stepData.units is required for step 1');
    }
    const parsedUnits = z.array(unitSchema).min(1).parse(normalized.units) as UnitDraftData[];
    return { units: parsedUnits };
  }

  if (step === 2) {
    if (normalized.rules === undefined) {
      throw new ValidationError('stepData.rules is required for step 2 (object or null)');
    }
    return { rules: z.union([rulesSchema, z.null()]).parse(normalized.rules) as RulesStepData | null };
  }

  if (normalized.invite === undefined) {
    throw new ValidationError('stepData.invite is required for step 3 (object or null)');
  }

  return {
    invite: z.union([inviteSchema, z.null()]).parse(normalized.invite) as InviteStepData | null,
  };
}

function sectionLabelForStep(step: number): 'profile' | 'units' | 'rules' | 'invite' {
  if (step === 0) return 'profile';
  if (step === 1) return 'units';
  if (step === 2) return 'rules';
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
  const wizard = await getOrCreateWizardState(scoped, communityId);

  const stepData = normalizeWizardStepData(wizard.stepData);

  return NextResponse.json({
    data: {
      status: wizard.status,
      lastCompletedStep: wizard.lastCompletedStep,
      nextStep: deriveNextStep(wizard.lastCompletedStep),
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
  const wizard = await getOrCreateWizardState(scoped, communityId);

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
      nextStep: deriveNextStep(lastCompletedStep),
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
  const wizard = await getOrCreateWizardState(scoped, communityId);

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

    for (const unit of draftUnits) {
      await scoped.insert(units, {
        communityId,
        unitNumber: unit.unitNumber,
        floor: unit.floor ?? null,
        bedrooms: unit.bedrooms ?? null,
        bathrooms: unit.bathrooms ?? null,
        sqft: unit.sqft ?? null,
        rentAmount: unit.rentAmount ?? null,
      });
    }

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
      role: 'tenant',
      unitId: matchedUnit['id'] as number,
      actorUserId,
      communityType: membership.communityType as CommunityType,
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
