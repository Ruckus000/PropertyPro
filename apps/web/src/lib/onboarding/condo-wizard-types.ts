/**
 * Shared condo/HOA onboarding wizard types (P2-39).
 *
 * Canonical JSONB shape in onboarding_wizard_state.stepData:
 * - statutory
 * - profile
 * - branding
 * - units
 * - completionMarkers
 */

import type { WizardStatus } from './wizard-common';
export type { WizardStatus };

export interface StatutoryStepData {
    items: {
        templateKey: string;
        documentId: number;
        categoryId: number;
    }[];
}

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

export interface UnitDraftData {
    unitNumber: string;
    floor?: number | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    sqft?: number | null;
    rentAmount?: string | null;
}

export type CompletionMarkers = {
    unitsCreated?: boolean;
};

export interface BrandingStepData {
    presetId?: string | null;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    fontHeading: string;
    fontBody: string;
}

export interface CondoWizardStepData {
    statutory?: StatutoryStepData;
    profile?: ProfileStepData;
    branding?: BrandingStepData;
    units?: UnitDraftData[];
    completionMarkers?: CompletionMarkers;
}

export interface CondoWizardStatePayload {
    status: WizardStatus;
    lastCompletedStep: number | null;
    nextStep: number;
    stepData: CondoWizardStepData;
    completedAt: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function normalizeUnits(value: unknown): UnitDraftData[] | undefined {
    if (!Array.isArray(value)) return undefined;

    const normalized: UnitDraftData[] = [];
    for (const entry of value) {
        if (!isRecord(entry)) continue;
        const unitNumber = typeof entry.unitNumber === 'string' ? entry.unitNumber : '';
        normalized.push({
            unitNumber,
            floor: typeof entry.floor === 'number' ? entry.floor : null,
            bedrooms: typeof entry.bedrooms === 'number' ? entry.bedrooms : null,
            bathrooms: typeof entry.bathrooms === 'number' ? entry.bathrooms : null,
            sqft: typeof entry.sqft === 'number' ? entry.sqft : null,
            rentAmount:
                typeof entry.rentAmount === 'string'
                    ? entry.rentAmount
                    : entry.rentAmount == null
                        ? null
                        : String(entry.rentAmount),
        });
    }
    return normalized;
}

/**
 * Normalize canonical and legacy step data keys into the canonical shape.
 */
export function normalizeCondoWizardStepData(input: unknown): CondoWizardStepData {
    if (!isRecord(input)) return {};

    const statutory = isRecord(input.statutory)
        ? (input.statutory as unknown as StatutoryStepData)
        : undefined;

    const profile = isRecord(input.profile)
        ? (input.profile as unknown as ProfileStepData)
        : undefined;

    const units = normalizeUnits(input.units);

    const completionMarkers = isRecord(input.completionMarkers)
        ? (input.completionMarkers as CompletionMarkers)
        : undefined;

    const branding = isRecord(input.branding)
        ? (input.branding as unknown as BrandingStepData)
        : undefined;

    return {
        statutory,
        profile,
        branding,
        units,
        completionMarkers,
    };
}

/**
 * Convert partial patch payload into canonical keys.
 */
export function normalizeCondoWizardStepPatch(input: unknown): Partial<CondoWizardStepData> {
    const normalized = normalizeCondoWizardStepData(input);
    const patch: Partial<CondoWizardStepData> = {};

    if (normalized.statutory !== undefined) patch.statutory = normalized.statutory;
    if (normalized.profile !== undefined) patch.profile = normalized.profile;
    if (normalized.branding !== undefined) patch.branding = normalized.branding;
    if (normalized.units !== undefined) patch.units = normalized.units;
    if (normalized.completionMarkers !== undefined) {
        patch.completionMarkers = normalized.completionMarkers;
    }

    return patch;
}
