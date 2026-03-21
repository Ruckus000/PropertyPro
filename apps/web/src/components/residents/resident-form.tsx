'use client';

import { useMemo, useState, type FormEvent } from 'react';
import type { CommunityType, NewCommunityRole, PresetKey } from '@propertypro/shared';
import { validateRoleAssignment } from '@/lib/utils/role-validator';

// ---------------------------------------------------------------------------
// Role option definitions — maps user-friendly labels to v2 API fields
// ---------------------------------------------------------------------------

interface RoleOption {
  /** Display label shown in the dropdown */
  label: string;
  /** Internal key used as the <option> value */
  key: string;
  /** v2 API role field */
  apiRole: NewCommunityRole;
  /** v2 API isUnitOwner field */
  isUnitOwner: boolean;
  /** v2 API presetKey field (managers only) */
  presetKey: PresetKey | null;
  /** Whether unit selection is required for this role */
  unitRequired: boolean;
  /** Which community types this role is available for */
  communityTypes: readonly CommunityType[];
}

const ROLE_OPTIONS: readonly RoleOption[] = [
  {
    label: 'Owner',
    key: 'owner',
    apiRole: 'resident',
    isUnitOwner: true,
    presetKey: null,
    unitRequired: true,
    communityTypes: ['condo_718', 'hoa_720'],
  },
  {
    label: 'Tenant',
    key: 'tenant',
    apiRole: 'resident',
    isUnitOwner: false,
    presetKey: null,
    unitRequired: true,
    communityTypes: ['condo_718', 'hoa_720', 'apartment'],
  },
  {
    label: 'Board President',
    key: 'board_president',
    apiRole: 'manager',
    isUnitOwner: false,
    presetKey: 'board_president',
    unitRequired: false,
    communityTypes: ['condo_718', 'hoa_720'],
  },
  {
    label: 'Board Member',
    key: 'board_member',
    apiRole: 'manager',
    isUnitOwner: false,
    presetKey: 'board_member',
    unitRequired: false,
    communityTypes: ['condo_718', 'hoa_720'],
  },
  {
    label: 'Community Association Manager',
    key: 'cam',
    apiRole: 'manager',
    isUnitOwner: false,
    presetKey: 'cam',
    unitRequired: false,
    communityTypes: ['condo_718', 'hoa_720'],
  },
  {
    label: 'Site Manager',
    key: 'site_manager',
    apiRole: 'manager',
    isUnitOwner: false,
    presetKey: 'site_manager',
    unitRequired: false,
    communityTypes: ['apartment'],
  },
] as const;

// ---------------------------------------------------------------------------
// Form value types
// ---------------------------------------------------------------------------

/** Internal form state — uses the user-friendly role key. */
interface FormValues {
  fullName: string;
  email: string;
  phone: string;
  /** Key into ROLE_OPTIONS (e.g. 'owner', 'tenant', 'board_president') */
  roleKey: string;
  unitId: number | null;
}

/** Values emitted to the parent via onSubmit — uses the v2 API model. */
export interface ResidentFormSubmitValues {
  fullName: string;
  email: string;
  phone: string;
  role: NewCommunityRole;
  unitId: number | null;
  isUnitOwner: boolean;
  presetKey: PresetKey | null;
}

interface ResidentFormProps {
  communityType: CommunityType;
  defaultValues?: Partial<FormValues>;
  submitting?: boolean;
  onSubmit: (values: ResidentFormSubmitValues) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ResidentForm({
  communityType,
  defaultValues,
  submitting = false,
  onSubmit,
}: ResidentFormProps) {
  const availableRoles = useMemo(
    () => ROLE_OPTIONS.filter((opt) => opt.communityTypes.includes(communityType)),
    [communityType],
  );

  const defaultRoleKey = defaultValues?.roleKey
    ?? (availableRoles[0]?.key ?? 'tenant');

  const initial = useMemo<FormValues>(
    () => ({
      fullName: defaultValues?.fullName ?? '',
      email: defaultValues?.email ?? '',
      phone: defaultValues?.phone ?? '',
      roleKey: defaultRoleKey,
      unitId: defaultValues?.unitId ?? null,
    }),
    [defaultValues, defaultRoleKey],
  );

  const [values, setValues] = useState<FormValues>(initial);
  const [error, setError] = useState<string | null>(null);

  const selectedRole = availableRoles.find((opt) => opt.key === values.roleKey)
    ?? availableRoles[0];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!selectedRole) {
      setError('Please select a role');
      return;
    }

    // Validate using the v2 role against the community type
    const validation = validateRoleAssignment(
      selectedRole.apiRole,
      communityType,
      selectedRole.unitRequired ? values.unitId : null,
    );
    if (!validation.valid) {
      setError(validation.error ?? 'Invalid role assignment');
      return;
    }

    // Unit is required for residents
    if (selectedRole.unitRequired && values.unitId == null) {
      setError(`A unit assignment is required for the ${selectedRole.label} role`);
      return;
    }

    // Transform to v2 API model
    const submitValues: ResidentFormSubmitValues = {
      fullName: values.fullName,
      email: values.email,
      phone: values.phone,
      role: selectedRole.apiRole,
      unitId: values.unitId,
      isUnitOwner: selectedRole.isUnitOwner,
      presetKey: selectedRole.presetKey,
    };

    await onSubmit(submitValues);
  }

  const showUnitField = selectedRole?.unitRequired ?? false;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="resident-form">
      {error ? <p className="text-sm text-status-danger">{error}</p> : null}

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-content-secondary">Full name</span>
        <input
          required
          value={values.fullName}
          onChange={(event) => setValues((prev) => ({ ...prev, fullName: event.target.value }))}
          className="w-full rounded-md border border-edge-strong px-3 py-2"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-content-secondary">Email</span>
        <input
          required
          type="email"
          value={values.email}
          onChange={(event) => setValues((prev) => ({ ...prev, email: event.target.value }))}
          className="w-full rounded-md border border-edge-strong px-3 py-2"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-content-secondary">Phone</span>
        <input
          value={values.phone}
          onChange={(event) => setValues((prev) => ({ ...prev, phone: event.target.value }))}
          className="w-full rounded-md border border-edge-strong px-3 py-2"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-content-secondary">Role</span>
        <select
          value={values.roleKey}
          onChange={(event) => {
            const newKey = event.target.value;
            setValues((prev) => ({
              ...prev,
              roleKey: newKey,
              // Clear unit when switching to a non-unit role
              unitId: availableRoles.find((r) => r.key === newKey)?.unitRequired
                ? prev.unitId
                : null,
            }));
          }}
          className="w-full rounded-md border border-edge-strong px-3 py-2"
        >
          {availableRoles.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      {showUnitField ? (
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-content-secondary">
            Unit ID <span className="text-status-danger">*</span>
          </span>
          <input
            type="number"
            required
            value={values.unitId ?? ''}
            onChange={(event) => {
              const value = event.target.value.trim();
              setValues((prev) => ({
                ...prev,
                unitId: value === '' ? null : Number(value),
              }));
            }}
            className="w-full rounded-md border border-edge-strong px-3 py-2"
          />
        </label>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover disabled:opacity-60"
      >
        {submitting ? 'Saving...' : 'Save resident'}
      </button>
    </form>
  );
}
