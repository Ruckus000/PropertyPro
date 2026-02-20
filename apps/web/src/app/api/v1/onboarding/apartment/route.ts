/**
 * Apartment onboarding wizard API — P2-38
 *
 * GET    /api/v1/onboarding/apartment  — load or initialize wizard state
 * PATCH  /api/v1/onboarding/apartment  — save step data (currentStep, stepData)
 * POST   /api/v1/onboarding/apartment  — complete or skip wizard
 *
 * Authorization:
 * - GET: Any authenticated community member can read
 * - PATCH/POST: ONLY site_manager or property_manager_admin can mutate
 *
 * Completion flow (POST):
 * - Idempotent via stepData.completionMarkers
 * - Creates units in bulk, resident, and invitation if not skipped
 * - Updates wizard status to 'completed'
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
import type { CommunityType } from '@propertypro/shared';

const WIZARD_TYPE = 'apartment';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const communityIdSchema = z.coerce.number().int().positive();

const stepDataSchema = z.object({
  profile: z
    .object({
      name: z.string().min(1),
      addressLine1: z.string().min(1),
      addressLine2: z.string().optional(),
      city: z.string().min(1),
      state: z.string().min(1),
      zipCode: z.string().min(1),
      timezone: z.string().min(1),
      logoPath: z.string().nullable().optional(),
    })
    .optional(),
  unitsTable: z
    .array(
      z.object({
        unitNumber: z.string().min(1),
        floor: z.number().int().nullable().optional(),
        bedrooms: z.number().int().nullable().optional(),
        bathrooms: z.number().int().nullable().optional(),
        sqft: z.number().int().nullable().optional(),
        rentAmount: z.string().nullable().optional(),
      }),
    )
    .optional(),
  inviteEmail: z
    .object({
      email: z.string().email(),
      fullName: z.string().min(1),
      unitNumber: z.string().min(1),
    })
    .nullable()
    .optional(),
  completionMarkers: z
    .object({
      unitsCreated: z.boolean().optional(),
      residentCreated: z.boolean().optional(),
      inviteCreated: z.boolean().optional(),
    })
    .optional(),
});

const patchWizardSchema = z.object({
  communityId: z.number().int().positive(),
  currentStep: z.number().int().min(1).max(3),
  stepData: stepDataSchema,
});

const completeWizardSchema = z.object({
  communityId: z.number().int().positive(),
  skip: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Helper: Check if user has mutation authorization
// ---------------------------------------------------------------------------

function requireMutationAuthorization(role: string): void {
  if (!['site_manager', 'property_manager_admin'].includes(role)) {
    throw new ForbiddenError('Only site managers and property manager admins can modify wizard state');
  }
}

// ---------------------------------------------------------------------------
// GET — load or initialize wizard state
// ---------------------------------------------------------------------------

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
  await requireCommunityMembership(communityId, actorUserId);
  const scoped = createScopedClient(communityId);

  // Race-safe initialization: check if exists, insert if not
  let wizardRows = await scoped.query(onboardingWizardState);
  let wizard = wizardRows.find(
    (row) =>
      row['communityId'] === communityId &&
      row['wizardType'] === WIZARD_TYPE,
  );

  if (!wizard) {
    // Initialize wizard state
    const inserted = await scoped.insert(onboardingWizardState, {
      communityId,
      wizardType: WIZARD_TYPE,
      status: 'in_progress',
      lastCompletedStep: null,
      stepData: {},
    });
    wizard = inserted[0] as Record<string, unknown>;
  }

  return NextResponse.json({
    data: {
      wizardType: wizard['wizardType'] as string,
      status: wizard['status'] as string,
      currentStep: (wizard['lastCompletedStep'] as number | null) ?? 0,
      stepData: (wizard['stepData'] as Record<string, unknown>) ?? {},
      completedAt: (wizard['completedAt'] as string | null) ?? null,
    },
  });
});

// ---------------------------------------------------------------------------
// PATCH — save step data
// ---------------------------------------------------------------------------

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const parseResult = patchWizardSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Validation failed', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = resolveEffectiveCommunityId(req, parseResult.data.communityId);
  const { currentStep, stepData } = parseResult.data;
  const actorUserId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, actorUserId);

  // Authorization: ONLY site_manager or property_manager_admin
  requireMutationAuthorization(membership.role);

  const scoped = createScopedClient(communityId);

  // Ensure wizard state exists
  const wizardRows = await scoped.query(onboardingWizardState);
  const exists = wizardRows.some(
    (row) =>
      row['communityId'] === communityId &&
      row['wizardType'] === WIZARD_TYPE,
  );

  if (!exists) {
    await scoped.insert(onboardingWizardState, {
      communityId,
      wizardType: WIZARD_TYPE,
      status: 'in_progress',
      lastCompletedStep: null,
      stepData: {},
    });
  }

  // Update wizard state
  await scoped.update(
    onboardingWizardState,
    {
      lastCompletedStep: currentStep,
      stepData,
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
      currentStep,
      stepData,
    },
  });

  return NextResponse.json({
    data: {
      success: true,
      currentStep,
    },
  });
});

// ---------------------------------------------------------------------------
// POST — complete or skip wizard
// ---------------------------------------------------------------------------

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const parseResult = completeWizardSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Validation failed', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = resolveEffectiveCommunityId(req, parseResult.data.communityId);
  const { skip = false } = parseResult.data;
  const actorUserId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, actorUserId);

  // Authorization: ONLY site_manager or property_manager_admin
  requireMutationAuthorization(membership.role);

  const scoped = createScopedClient(communityId);

  // Load current wizard state
  const wizardRows = await scoped.query(onboardingWizardState);
  const wizard = wizardRows.find(
    (row) =>
      row['communityId'] === communityId &&
      row['wizardType'] === WIZARD_TYPE,
  );

  if (!wizard) {
    throw new NotFoundError('Wizard state not found');
  }

  const stepData = (wizard['stepData'] as Record<string, unknown>) ?? {};
  const completionMarkers = (stepData.completionMarkers as Record<string, boolean> | undefined) ?? {};

  // If skipping, just mark as skipped
  if (skip) {
    await scoped.update(
      onboardingWizardState,
      {
        status: 'skipped',
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
      newValues: { status: 'skipped' },
    });

    return NextResponse.json({
      data: {
        success: true,
        status: 'skipped',
      },
    });
  }

  // Complete wizard: execute sub-steps idempotently
  const now = new Date();

  // Step 1: Create units from unitsTable (if not already created)
  if (!completionMarkers.unitsCreated) {
    const unitsTable = stepData.unitsTable as Array<Record<string, unknown>> | undefined;
    if (unitsTable && unitsTable.length > 0) {
      // Insert units one by one (scoped.insert doesn't support bulk inserts)
      for (const unit of unitsTable) {
        await scoped.insert(units, {
          communityId,
          unitNumber: unit.unitNumber as string,
          floor: (unit.floor as number | null) ?? null,
          bedrooms: (unit.bedrooms as number | null) ?? null,
          bathrooms: (unit.bathrooms as number | null) ?? null,
          sqft: (unit.sqft as number | null) ?? null,
          rentAmount: (unit.rentAmount as string | null) ?? null,
        });
      }

      // Mark as created
      completionMarkers.unitsCreated = true;
      stepData.completionMarkers = completionMarkers;

      await scoped.update(
        onboardingWizardState,
        {
          stepData,
          updatedAt: now,
        },
        and(
          eq(onboardingWizardState.communityId, communityId),
          eq(onboardingWizardState.wizardType, WIZARD_TYPE),
        ),
      );
    }
  }

  // Step 2: Create resident (if not already created)
  if (!completionMarkers.residentCreated) {
    const inviteEmail = stepData.inviteEmail as Record<string, unknown> | null | undefined;
    if (inviteEmail) {
      // Get community type for role validation
      const communityRows = await scoped.query(communities);
      const community = communityRows.find((row) => row['id'] === communityId);
      const communityType = (community?.['communityType'] as CommunityType) ?? 'apartment';

      // Find the unit ID for the specified unit number
      const unitRows = await scoped.query(units);
      const unit = unitRows.find(
        (row) => row['unitNumber'] === (inviteEmail.unitNumber as string),
      );
      const unitId = (unit?.['id'] as number | undefined) ?? null;

      await createOnboardingResident({
        communityId,
        email: inviteEmail.email as string,
        fullName: inviteEmail.fullName as string,
        phone: null,
        role: 'tenant',
        unitId,
        actorUserId,
        communityType,
      });

      // Mark as created
      completionMarkers.residentCreated = true;
      stepData.completionMarkers = completionMarkers;

      await scoped.update(
        onboardingWizardState,
        {
          stepData,
          updatedAt: now,
        },
        and(
          eq(onboardingWizardState.communityId, communityId),
          eq(onboardingWizardState.wizardType, WIZARD_TYPE),
        ),
      );
    }
  }

  // Step 3: Create invitation (if not already created)
  if (!completionMarkers.inviteCreated) {
    const inviteEmail = stepData.inviteEmail as Record<string, unknown> | null | undefined;
    if (inviteEmail) {
      // Find the user we just created (or already exists)
      const userEmail = (inviteEmail.email as string).toLowerCase();
      const allUsers = await scoped.query(users);
      const user = allUsers.find(
        (row) => (row['email'] as string).toLowerCase() === userEmail,
      );

      if (user) {
        await createOnboardingInvitation({
          communityId,
          userId: user['id'] as string,
          ttlDays: 7,
          actorUserId,
        });

        // Mark as created
        completionMarkers.inviteCreated = true;
        stepData.completionMarkers = completionMarkers;

        await scoped.update(
          onboardingWizardState,
          {
            stepData,
            updatedAt: now,
          },
          and(
            eq(onboardingWizardState.communityId, communityId),
            eq(onboardingWizardState.wizardType, WIZARD_TYPE),
          ),
        );
      }
    }
  }

  // Step 4: Update community profile if provided
  const profile = stepData.profile as Record<string, unknown> | undefined;
  if (profile) {
    const communityUpdate: Record<string, unknown> = {
      name: profile.name as string,
      addressLine1: profile.addressLine1 as string,
      addressLine2: (profile.addressLine2 as string | undefined) ?? null,
      city: profile.city as string,
      state: profile.state as string,
      zipCode: profile.zipCode as string,
      timezone: profile.timezone as string,
      updatedAt: now,
    };

    if (profile.logoPath) {
      communityUpdate.logoPath = profile.logoPath as string;
    }

    await scoped.update(
      communities,
      communityUpdate,
      eq(communities.id, communityId),
    );
  }

  // Mark wizard as completed
  await scoped.update(
    onboardingWizardState,
    {
      status: 'completed',
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
