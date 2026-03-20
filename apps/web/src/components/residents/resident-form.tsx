'use client';

import { useMemo, useState, type FormEvent } from 'react';
import type { CommunityRole, CommunityType } from '@propertypro/shared';
import { COMMUNITY_ROLES } from '@propertypro/shared';
import { validateRoleAssignment } from '@/lib/utils/role-validator';

interface ResidentFormValues {
  fullName: string;
  email: string;
  phone: string;
  role: CommunityRole;
  unitId: number | null;
}

interface ResidentFormProps {
  communityType: CommunityType;
  defaultValues?: Partial<ResidentFormValues>;
  submitting?: boolean;
  onSubmit: (values: ResidentFormValues) => Promise<void>;
}

const DEFAULT_VALUES: ResidentFormValues = {
  fullName: '',
  email: '',
  phone: '',
  role: 'tenant',
  unitId: null,
};

export function ResidentForm({
  communityType,
  defaultValues,
  submitting = false,
  onSubmit,
}: ResidentFormProps) {
  const initial = useMemo(
    () => ({ ...DEFAULT_VALUES, ...defaultValues }),
    [defaultValues],
  );

  const [values, setValues] = useState<ResidentFormValues>(initial);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const validation = validateRoleAssignment(values.role, communityType, values.unitId);
    if (!validation.valid) {
      setError(validation.error ?? 'Invalid role assignment');
      return;
    }

    await onSubmit(values);
  }

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
          value={values.role}
          onChange={(event) => setValues((prev) => ({
            ...prev,
            role: event.target.value as CommunityRole,
          }))}
          className="w-full rounded-md border border-edge-strong px-3 py-2"
        >
          {COMMUNITY_ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-content-secondary">Unit ID (optional)</span>
        <input
          type="number"
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
