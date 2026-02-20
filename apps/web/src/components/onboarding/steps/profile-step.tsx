'use client';

import { FormEvent, useState } from 'react';
import type { ProfileStepData } from '@/lib/onboarding/apartment-wizard-types';

interface PresignResponse {
  data: {
    path: string;
    uploadUrl: string;
  };
}

interface ProfileStepProps {
  communityId: number;
  onNext: (data: ProfileStepData) => Promise<void> | void;
  initialData?: Partial<ProfileStepData>;
}

const MAX_LOGO_BYTES = 10 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']);

async function uploadLogoFile(communityId: number, file: File): Promise<string> {
  const presignResponse = await fetch('/api/v1/upload', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      communityId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    }),
  });

  if (!presignResponse.ok) {
    throw new Error('Failed to prepare logo upload');
  }

  const presignBody = (await presignResponse.json()) as PresignResponse;

  const uploadResponse = await fetch(presignBody.data.uploadUrl, {
    method: 'PUT',
    headers: {
      'content-type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error('Failed to upload logo image');
  }

  return presignBody.data.path;
}

export function ProfileStep({ communityId, onNext, initialData }: ProfileStepProps) {
  const [name, setName] = useState(initialData?.name ?? '');
  const [addressLine1, setAddressLine1] = useState(initialData?.addressLine1 ?? '');
  const [addressLine2, setAddressLine2] = useState(initialData?.addressLine2 ?? '');
  const [city, setCity] = useState(initialData?.city ?? '');
  const [state, setState] = useState(initialData?.state ?? 'FL');
  const [zipCode, setZipCode] = useState(initialData?.zipCode ?? '');
  const [timezone, setTimezone] = useState(initialData?.timezone ?? 'America/New_York');
  const [logoPath, setLogoPath] = useState<string | null>(initialData?.logoPath ?? null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleLogoSelection(file: File | null): void {
    if (!file) {
      setLogoFile(null);
      setError(null);
      return;
    }

    if (!ALLOWED_LOGO_TYPES.has(file.type)) {
      setError('Logo must be a PNG, JPG, JPEG, WEBP, or SVG image.');
      setLogoFile(null);
      return;
    }

    if (file.size > MAX_LOGO_BYTES) {
      setError('Logo image must be 10MB or smaller.');
      setLogoFile(null);
      return;
    }

    setError(null);
    setLogoFile(file);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      let resolvedLogoPath = logoPath;
      if (logoFile) {
        resolvedLogoPath = await uploadLogoFile(communityId, logoFile);
        setLogoPath(resolvedLogoPath);
      }

      await onNext({
        name: name.trim(),
        addressLine1: addressLine1.trim(),
        addressLine2: addressLine2.trim() || null,
        city: city.trim(),
        state: state.trim(),
        zipCode: zipCode.trim(),
        timezone: timezone.trim(),
        logoPath: resolvedLogoPath,
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to save profile step');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">Community Profile</h2>
        <p className="mt-1 text-sm text-gray-600">
          Tell us about your community so we can set up your account.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">
            Community Name
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="e.g., Metro Apartments"
            required
          />
        </div>

        <div>
          <label htmlFor="addressLine1" className="mb-1 block text-sm font-medium text-gray-700">
            Street Address
          </label>
          <input
            type="text"
            id="addressLine1"
            value={addressLine1}
            onChange={(event) => setAddressLine1(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="123 Main Street"
            required
          />
        </div>

        <div>
          <label htmlFor="addressLine2" className="mb-1 block text-sm font-medium text-gray-700">
            Address Line 2 <span className="text-gray-500">(optional)</span>
          </label>
          <input
            type="text"
            id="addressLine2"
            value={addressLine2}
            onChange={(event) => setAddressLine2(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Suite, building, or additional details"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="city" className="mb-1 block text-sm font-medium text-gray-700">
              City
            </label>
            <input
              type="text"
              id="city"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Miami"
              required
            />
          </div>

          <div>
            <label htmlFor="state" className="mb-1 block text-sm font-medium text-gray-700">
              State
            </label>
            <input
              type="text"
              id="state"
              value={state}
              onChange={(event) => setState(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="FL"
              maxLength={2}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="zipCode" className="mb-1 block text-sm font-medium text-gray-700">
              ZIP Code
            </label>
            <input
              type="text"
              id="zipCode"
              value={zipCode}
              onChange={(event) => setZipCode(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="33101"
              pattern="[0-9]{5}"
              maxLength={5}
              required
            />
          </div>

          <div>
            <label htmlFor="timezone" className="mb-1 block text-sm font-medium text-gray-700">
              Timezone
            </label>
            <select
              id="timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            >
              <option value="America/New_York">Eastern Time (ET)</option>
              <option value="America/Chicago">Central Time (CT)</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="logo" className="mb-1 block text-sm font-medium text-gray-700">
            Community Logo <span className="text-gray-500">(optional)</span>
          </label>
          <input
            id="logo"
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
            onChange={(event) => handleLogoSelection(event.target.files?.[0] ?? null)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
          />
          <p className="mt-1 text-xs text-gray-500">PNG, JPG, WEBP, or SVG up to 10MB.</p>
          {logoPath && !logoFile && (
            <p className="mt-1 text-xs text-gray-600">Current logo path: {logoPath}</p>
          )}
          {logoFile && (
            <p className="mt-1 text-xs text-gray-600">Selected file: {logoFile.name}</p>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Saving...' : 'Next'}
        </button>
      </div>
    </form>
  );
}
