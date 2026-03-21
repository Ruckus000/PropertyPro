import type { createScopedClient } from '@propertypro/db';
import { communities, onboardingWizardState } from '@propertypro/db';
import { eq, and } from '@propertypro/db/filters';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/api/errors';

export type ScopedClient = ReturnType<typeof createScopedClient>;

export interface ProfileStepData {
    name: string;
    addressLine1: string;
    addressLine2?: string | null;
    city: string;
    state: string;
    zipCode: string;
    timezone: string;
    logoPath?: string | null;
}

export type WizardStatus = 'in_progress' | 'completed' | 'skipped';

export interface WizardRow {
    status: WizardStatus;
    lastCompletedStep: number | null;
    stepData: unknown;
    completedAt: Date | string | null;
}

export function requireMutationAuthorization(role: string): void {
    const allowedRoles = ['manager', 'pm_admin'];
    if (!allowedRoles.includes(role)) {
        throw new ForbiddenError('Only board members, CAMs, and property managers can modify wizard state');
    }
}

export function isUniqueViolation(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
        return false;
    }
    const maybeCode = (error as { code?: unknown }).code;
    return maybeCode === '23505';
}

export function toIsoString(value: Date | string | null): string | null {
    if (value == null) return null;
    if (typeof value === 'string') return value;
    return value.toISOString();
}

export function deriveNextStep(lastCompletedStep: number | null, maxStepIndex: number): number {
    if (lastCompletedStep == null) return 0;
    return Math.min(lastCompletedStep + 1, maxStepIndex);
}

export function normalizeStepIndex(step: number | undefined, currentStep: number | undefined): number {
    if (step !== undefined) return step;
    if (currentStep === undefined) {
        throw new ValidationError('step or currentStep is required');
    }
    return currentStep - 1;
}

export function normalizeAction(action: 'complete' | 'skip' | undefined, skip: boolean | undefined): 'complete' | 'skip' {
    if (action) return action;
    return skip ? 'skip' : 'complete';
}

export async function updateCommunityProfile(
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

export function parseWizardRow(row: Record<string, unknown>): WizardRow {
    return {
        status: (row['status'] as WizardStatus) ?? 'in_progress',
        lastCompletedStep:
            typeof row['lastCompletedStep'] === 'number' ? (row['lastCompletedStep'] as number) : null,
        stepData: row['stepData'] ?? {},
        completedAt: (row['completedAt'] as Date | string | null | undefined) ?? null,
    };
}

/**
 * Build a partial ProfileStepData from existing community data.
 * Used to pre-populate the wizard's Profile step on first creation,
 * so users don't have to re-enter data collected during signup.
 */
export function buildProfileFromCommunity(
    communityRow: Record<string, unknown>,
): Partial<ProfileStepData> {
    const profile: Partial<ProfileStepData> = {};

    const name = communityRow['name'];
    if (typeof name === 'string' && name.length > 0) {
        profile.name = name;
    }

    const addressLine1 = communityRow['addressLine1'];
    if (typeof addressLine1 === 'string' && addressLine1.length > 0) {
        profile.addressLine1 = addressLine1;
    }

    const addressLine2 = communityRow['addressLine2'];
    if (typeof addressLine2 === 'string' && addressLine2.length > 0) {
        profile.addressLine2 = addressLine2;
    }

    const city = communityRow['city'];
    if (typeof city === 'string' && city.length > 0) {
        profile.city = city;
    }

    const state = communityRow['state'];
    if (typeof state === 'string' && state.length > 0) {
        profile.state = state;
    }

    const zipCode = communityRow['zipCode'];
    if (typeof zipCode === 'string' && zipCode.length > 0) {
        profile.zipCode = zipCode;
    }

    const timezone = communityRow['timezone'];
    if (typeof timezone === 'string' && timezone.length > 0) {
        profile.timezone = timezone;
    }

    return profile;
}

export async function getOrCreateWizardState(
    scoped: ScopedClient,
    communityId: number,
    wizardType: string,
    initialStepData?: Record<string, unknown>,
): Promise<WizardRow> {
    const rows = await scoped.query(onboardingWizardState);
    const existing = rows.find((row) => row['wizardType'] === wizardType);

    if (existing) {
        return parseWizardRow(existing);
    }

    try {
        const inserted = await scoped.insert(onboardingWizardState, {
            communityId,
            wizardType,
            status: 'in_progress',
            lastCompletedStep: null,
            stepData: initialStepData ?? {},
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
    const retry = retryRows.find((row) => row['wizardType'] === wizardType);
    if (!retry) {
        throw new NotFoundError('Failed to load wizard state after initialization');
    }

    return parseWizardRow(retry);
}

export function mergeStepData<T extends { completionMarkers?: Record<string, boolean | undefined> | undefined }>(
    existing: T,
    patch: Partial<T>
): T {
    const merged: T = {
        ...existing,
        ...patch,
    };

    if (existing.completionMarkers || patch.completionMarkers) {
        merged.completionMarkers = {
            ...(existing.completionMarkers ?? {}),
            ...(patch.completionMarkers ?? {}),
        } as T['completionMarkers'];
    }

    return merged;
}
