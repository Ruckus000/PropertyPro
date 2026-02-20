'use client';

import { FormEvent, useMemo, useState } from 'react';
import type { InviteStepData } from '@/lib/onboarding/apartment-wizard-types';

export interface InviteData extends InviteStepData {}

interface InviteStepProps {
  units: Array<{ unitNumber: string }>;
  initialData?: InviteData | null;
  onNext: (data: InviteData | null) => Promise<void> | void;
  onBack: () => void;
  onSkip: () => Promise<void> | void;
}

export function InviteStep({ units, initialData, onNext, onBack, onSkip }: InviteStepProps) {
  const [email, setEmail] = useState(initialData?.email ?? '');
  const [fullName, setFullName] = useState(initialData?.fullName ?? '');
  const [unitNumber, setUnitNumber] = useState(initialData?.unitNumber ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const unitOptions = useMemo(
    () =>
      units
        .map((unit) => unit.unitNumber.trim())
        .filter((value, index, array) => value.length > 0 && array.indexOf(value) === index),
    [units],
  );

  function validateEmail(value: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const normalizedEmail = email.trim();
    const normalizedFullName = fullName.trim();
    const normalizedUnitNumber = unitNumber.trim();

    const allBlank = !normalizedEmail && !normalizedFullName && !normalizedUnitNumber;
    if (allBlank) {
      setIsSubmitting(true);
      try {
        await onNext(null);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : 'Failed to save invite step');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!normalizedEmail || !normalizedFullName || !normalizedUnitNumber) {
      setError('Provide email, full name, and unit number, or leave all fields blank to skip.');
      return;
    }

    if (!validateEmail(normalizedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (!unitOptions.includes(normalizedUnitNumber)) {
      setError('Select a valid unit for this invite.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onNext({
        email: normalizedEmail,
        fullName: normalizedFullName,
        unitNumber: normalizedUnitNumber,
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to save invite step');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSkipInvite(): Promise<void> {
    setError(null);
    setIsSubmitting(true);
    try {
      await onSkip();
    } catch (skipError) {
      setError(skipError instanceof Error ? skipError.message : 'Failed to skip invite step');
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">Invite Your First Resident</h2>
        <p className="mt-1 text-sm text-gray-600">
          This step is optional. Invite one resident now, or skip and invite later.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
        <div>
          <label htmlFor="inviteEmail" className="mb-1 block text-sm font-medium text-gray-700">
            Resident Email
          </label>
          <input
            id="inviteEmail"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError(null);
            }}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="resident@example.com"
          />
        </div>

        <div>
          <label htmlFor="inviteFullName" className="mb-1 block text-sm font-medium text-gray-700">
            Resident Full Name
          </label>
          <input
            id="inviteFullName"
            type="text"
            value={fullName}
            onChange={(event) => {
              setFullName(event.target.value);
              setError(null);
            }}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Jane Resident"
          />
        </div>

        <div>
          <label htmlFor="inviteUnit" className="mb-1 block text-sm font-medium text-gray-700">
            Unit
          </label>
          <select
            id="inviteUnit"
            value={unitNumber}
            onChange={(event) => {
              setUnitNumber(event.target.value);
              setError(null);
            }}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Select a unit</option>
            {unitOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-gray-300 bg-white px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Back
        </button>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSkipInvite}
            disabled={isSubmitting}
            className="rounded-md border border-gray-300 bg-white px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Skip Invite
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Saving...' : 'Complete Setup'}
          </button>
        </div>
      </div>
    </form>
  );
}
