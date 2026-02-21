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
    if (!['site_manager', 'property_manager_admin'].includes(role)) {
        throw new ForbiddenError('Only site managers and property manager admins can modify wizard state');
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

export async function getOrCreateWizardState(
    scoped: ScopedClient,
    communityId: number,
    wizardType: string,
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
