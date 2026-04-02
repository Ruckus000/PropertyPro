/**
 * Shared apartment onboarding wizard types (P2-38 closeout).
 *
 * Canonical JSONB shape in onboarding_wizard_state.stepData:
 * - profile
 * - branding
 * - units
 * - rules
 * - invite
 * - completionMarkers
 *
 * Backward compatibility:
 * - unitsTable -> units
 * - inviteEmail -> invite
 */

import type { WizardStatus } from './wizard-common';
export type { WizardStatus };

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

export interface RulesStepData {
  documentId: number;
  path: string;
}

export interface InviteStepData {
  email: string;
  fullName: string;
  unitNumber: string;
}

export type CompletionMarkers = {
  unitsCreated?: boolean;
  residentCreated?: boolean;
  inviteCreated?: boolean;
};

export interface BrandingStepData {
  presetId?: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontHeading: string;
  fontBody: string;
}

export interface WizardStepData {
  profile?: ProfileStepData;
  branding?: BrandingStepData;
  units?: UnitDraftData[];
  rules?: RulesStepData | null;
  invite?: InviteStepData | null;
  completionMarkers?: CompletionMarkers;
}

export interface ApartmentWizardStatePayload {
  status: WizardStatus;
  lastCompletedStep: number | null;
  nextStep: number;
  stepData: WizardStepData;
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
export function normalizeWizardStepData(input: unknown): WizardStepData {
  if (!isRecord(input)) return {};

  const profile = isRecord(input.profile)
    ? (input.profile as unknown as ProfileStepData)
    : undefined;

  const units = normalizeUnits(input.units ?? input.unitsTable);

  const rules = isRecord(input.rules)
    ? (input.rules as unknown as RulesStepData)
    : input.rules === null
      ? null
      : undefined;

  const inviteSource = input.invite !== undefined ? input.invite : input.inviteEmail;
  const invite = isRecord(inviteSource)
    ? (inviteSource as unknown as InviteStepData)
    : inviteSource === null
      ? null
      : undefined;

  const completionMarkers = isRecord(input.completionMarkers)
    ? (input.completionMarkers as CompletionMarkers)
    : undefined;

  const branding = isRecord(input.branding)
    ? (input.branding as unknown as BrandingStepData)
    : undefined;

  return {
    profile,
    branding,
    units,
    rules,
    invite,
    completionMarkers,
  };
}

/**
 * Convert partial legacy/canonical patch payload into canonical keys.
 */
export function normalizeWizardStepPatch(input: unknown): Partial<WizardStepData> {
  const normalized = normalizeWizardStepData(input);
  const patch: Partial<WizardStepData> = {};

  if (normalized.profile !== undefined) patch.profile = normalized.profile;
  if (normalized.branding !== undefined) patch.branding = normalized.branding;
  if (normalized.units !== undefined) patch.units = normalized.units;
  if (normalized.rules !== undefined) patch.rules = normalized.rules;
  if (normalized.invite !== undefined) patch.invite = normalized.invite;
  if (normalized.completionMarkers !== undefined) {
    patch.completionMarkers = normalized.completionMarkers;
  }

  return patch;
}
