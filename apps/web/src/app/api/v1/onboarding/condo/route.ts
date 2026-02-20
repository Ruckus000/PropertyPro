/**
 * Condo onboarding wizard API — P2-39
 *
 * GET    /api/v1/onboarding/condo  — load or initialize wizard state
 * PATCH  /api/v1/onboarding/condo  — save one wizard step
 * POST   /api/v1/onboarding/condo  — complete or skip wizard
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
    complianceChecklistItems,
    createScopedClient,
    documentCategories,
    documents,
    logAuditEvent,
    onboardingWizardState,
    units,
} from '@propertypro/db';
import { and, eq, inArray } from '@propertypro/db/filters';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import {
    type CondoWizardStatePayload,
    type ProfileStepData,
    type StatutoryStepData,
    type UnitDraftData,
    type CondoWizardStepData,
    normalizeCondoWizardStepData,
    normalizeCondoWizardStepPatch,
} from '@/lib/onboarding/condo-wizard-types';
import {
    type ScopedClient,
    requireMutationAuthorization,
    toIsoString,
    deriveNextStep,
    normalizeStepIndex,
    normalizeAction,
    mergeStepData,
    updateCommunityProfile,
    getOrCreateWizardState,
} from '@/lib/onboarding/wizard-common';

const WIZARD_TYPE = 'condo';
const MAX_STEP_INDEX = 2; // 0 Statutory, 1 Profile, 2 Units

const communityIdSchema = z.coerce.number().int().positive();

const statutorySchema = z.object({
    items: z.array(
        z.object({
            templateKey: z.string().trim().min(1),
            documentId: z.number().int().positive(),
            categoryId: z.number().int().positive(),
        })
    ),
});

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

const patchWizardSchema = z
    .object({
        communityId: z.number().int().positive(),
        step: z.number().int().min(0).max(MAX_STEP_INDEX).optional(),
        currentStep: z.number().int().min(1).max(MAX_STEP_INDEX + 1).optional(),
        stepData: z.unknown(),
    })
    .refine((payload) => payload.step !== undefined || payload.currentStep !== undefined, {
        path: ['step'],
        message: 'step (0-2) or currentStep (1-3) is required',
    });

const completeWizardSchema = z.object({
    communityId: z.number().int().positive(),
    action: z.enum(['complete', 'skip']).optional(),
    skip: z.boolean().optional(),
});

function requireCondoCommunity(communityType: string): void {
    const features = getFeaturesForCommunity(communityType as Parameters<typeof getFeaturesForCommunity>[0]);
    if (!features.hasCompliance) {
        throw new ForbiddenError('Condo onboarding is only available for condo/HOA communities');
    }
}

async function linkStatutoryDocuments(
    scoped: ScopedClient,
    statutory: StatutoryStepData,
    actorUserId: string,
): Promise<void> {
    const now = new Date();
    const templateKeys = statutory.items.map((item) => item.templateKey);
    const uniqueTemplateKeys = Array.from(new Set(templateKeys));
    if (uniqueTemplateKeys.length !== templateKeys.length) {
        throw new ValidationError('Duplicate template keys detected in submission.', {
            fields: [{ field: 'templateKey', message: 'Contains duplicate template keys' }],
        });
    }

    if (uniqueTemplateKeys.length > 0) {
        const matchingChecklistItems = await scoped.selectFrom(
            complianceChecklistItems,
            { templateKey: complianceChecklistItems.templateKey },
            inArray(complianceChecklistItems.templateKey, uniqueTemplateKeys),
        );
        const existingTemplateKeys = new Set(
            matchingChecklistItems.map((item) => String(item['templateKey'])),
        );
        const missingTemplateKeys = uniqueTemplateKeys.filter((key) => !existingTemplateKeys.has(key));
        if (missingTemplateKeys.length > 0) {
            throw new ValidationError(
                `Checklist template keys not found in this community: ${missingTemplateKeys.join(', ')}`,
                { fields: [{ field: 'templateKey', message: 'Unknown checklist template key' }] },
            );
        }
    }

    const uniqueCategoryIds = Array.from(new Set(statutory.items.map((item) => item.categoryId)));
    if (uniqueCategoryIds.length > 0) {
        const matchingCategories = await scoped.selectFrom(
            documentCategories,
            { id: documentCategories.id },
            inArray(documentCategories.id, uniqueCategoryIds),
        );
        const existingCategoryIds = new Set(
            matchingCategories.map((category) => Number(category['id'])),
        );
        const missingCategoryIds = uniqueCategoryIds.filter((id) => !existingCategoryIds.has(id));
        if (missingCategoryIds.length > 0) {
            throw new ValidationError(
                `Document categories not found in this community: ${missingCategoryIds.join(', ')}`,
                { fields: [{ field: 'categoryId', message: 'Invalid category ID' }] },
            );
        }
    }

    const uniqueDocumentIds = Array.from(new Set(statutory.items.map((item) => item.documentId)));
    if (uniqueDocumentIds.length > 0) {
        const matchingDocs = await scoped.selectFrom(
            documents,
            { id: documents.id },
            inArray(documents.id, uniqueDocumentIds),
        );
        const docIds = new Set(matchingDocs.map((doc) => Number(doc['id'])));
        const missingDocIds = uniqueDocumentIds.filter((id) => !docIds.has(id));
        if (missingDocIds.length > 0) {
            throw new ValidationError(
                `Documents not found in this community: ${missingDocIds.join(', ')}`,
                { fields: [{ field: 'documentId', message: 'Invalid document ID' }] },
            );
        }
    }

    const checklistUpdates = statutory.items.map(item =>
        scoped.update(complianceChecklistItems, {
            documentId: item.documentId,
            documentPostedAt: now,
            lastModifiedBy: actorUserId,
            updatedAt: now,
        }, eq(complianceChecklistItems.templateKey, item.templateKey))
    );

    const documentUpdates = statutory.items.map(item =>
        scoped.update(documents,
            { categoryId: item.categoryId, updatedAt: now },
            eq(documents.id, item.documentId)
        )
    );

    await Promise.all([...checklistUpdates, ...documentUpdates]);
}

async function persistStepData(
    scoped: ScopedClient,
    communityId: number,
    stepData: CondoWizardStepData,
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



function validateStepPatch(step: number, rawStepData: unknown): Partial<CondoWizardStepData> {
    const normalized = normalizeCondoWizardStepPatch(rawStepData);

    if (step === 0) {
        if (normalized.statutory === undefined) {
            throw new ValidationError('stepData.statutory is required for step 0');
        }
        return { statutory: statutorySchema.parse(normalized.statutory) as StatutoryStepData };
    }

    if (step === 1) {
        if (normalized.profile === undefined) {
            throw new ValidationError('stepData.profile is required for step 1');
        }
        return { profile: profileSchema.parse(normalized.profile) as ProfileStepData };
    }

    if (normalized.units === undefined) {
        throw new ValidationError('stepData.units is required for step 2');
    }
    const parsedUnits = z.array(unitSchema).min(1).parse(normalized.units) as UnitDraftData[];
    return { units: parsedUnits };
}

function sectionLabelForStep(step: number): 'statutory' | 'profile' | 'units' {
    if (step === 0) return 'statutory';
    if (step === 1) return 'profile';
    return 'units';
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
    requireCondoCommunity(membership.communityType);

    const scoped = createScopedClient(communityId);
    const wizard = await getOrCreateWizardState(scoped, communityId, WIZARD_TYPE);

    const stepData = normalizeCondoWizardStepData(wizard.stepData);

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

    requireCondoCommunity(membership.communityType);
    requireMutationAuthorization(membership.role);
    await requireActiveSubscriptionForMutation(communityId);

    const step = normalizeStepIndex(parseResult.data.step, parseResult.data.currentStep);
    const stepPatch = validateStepPatch(step, parseResult.data.stepData);

    const scoped = createScopedClient(communityId);
    const wizard = await getOrCreateWizardState(scoped, communityId, WIZARD_TYPE);

    const existingStepData = normalizeCondoWizardStepData(wizard.stepData);
    const mergedStepData = mergeStepData(existingStepData, stepPatch);

    if (step === 0 && mergedStepData.statutory) {
        await linkStatutoryDocuments(scoped, mergedStepData.statutory, actorUserId);
    }

    if (step === 1 && mergedStepData.profile) {
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

    requireCondoCommunity(membership.communityType);
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
    const stepData = normalizeCondoWizardStepData(wizard.stepData);
    const completionMarkers = {
        ...(stepData.completionMarkers ?? {}),
    };

    if (!completionMarkers.unitsCreated && (!Array.isArray(stepData.units) || stepData.units.length === 0)) {
        throw new ValidationError('At least one unit is required before completing onboarding.', {
            fields: [{ field: 'units', message: 'Add at least one unit before completion' }],
        });
    }

    if (!completionMarkers.unitsCreated) {
        const draftUnits = z.array(unitSchema).min(1).parse(stepData.units) as UnitDraftData[];

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

    // Extracted side-effects to PATCH phase only. We only do the completion markers in POST.

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
            hasStatutoryDocuments: stepData.statutory != null,
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
