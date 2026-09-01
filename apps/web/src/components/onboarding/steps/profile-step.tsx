'use client';

import { DragEvent, FormEvent, useState } from 'react';
import { AlertCircle, ArrowRight, Check, ChevronDown, UploadCloud } from 'lucide-react';
import type { ProfileStepData } from '@/lib/onboarding/apartment-wizard-types';
import { useUploadLogo } from '@/hooks/use-upload-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { WizardFooter } from '../wizard-footer';

interface ProfileStepProps {
  communityId: number;
  onNext: (data: ProfileStepData) => Promise<void> | void;
  initialData?: Partial<ProfileStepData>;
}

const MAX_LOGO_BYTES = 10 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']);

const LABEL_CLASS = 'mb-1.5 block text-sm font-medium text-content-secondary';
const SECTION_LABEL_CLASS = 'text-xs font-semibold uppercase tracking-wide text-content-tertiary';

export function ProfileStep({ communityId, onNext, initialData }: ProfileStepProps) {
  const uploadLogo = useUploadLogo();
  const [name, setName] = useState(initialData?.name ?? '');
  const [addressLine1, setAddressLine1] = useState(initialData?.addressLine1 ?? '');
  const [addressLine2, setAddressLine2] = useState(initialData?.addressLine2 ?? '');
  const [city, setCity] = useState(initialData?.city ?? '');
  const [state, setState] = useState(initialData?.state ?? 'FL');
  const [zipCode, setZipCode] = useState(initialData?.zipCode ?? '');
  const [zipError, setZipError] = useState(false);
  const [timezone, setTimezone] = useState(initialData?.timezone ?? 'America/New_York');
  const [logoPath, setLogoPath] = useState<string | null>(initialData?.logoPath ?? null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
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

  function handleZipChange(value: string): void {
    const digits = value.replace(/\D/g, '').slice(0, 5);
    setZipCode(digits);
    if (digits.length === 5) setZipError(false);
  }

  function handleZipBlur(): void {
    setZipError(zipCode.length > 0 && zipCode.length < 5);
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    setIsDragging(false);
    handleLogoSelection(event.dataTransfer.files?.[0] ?? null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      let resolvedLogoPath = logoPath;
      if (logoFile) {
        resolvedLogoPath = await uploadLogo.mutateAsync({ communityId, file: logoFile });
        setLogoPath(resolvedLogoPath);
        setLogoFile(null);
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
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
      <div className="flex-1 px-6 py-10 sm:px-10 lg:px-14">
        <div className="mx-auto w-full max-w-xl">
          <p className={SECTION_LABEL_CLASS}>Step 1 of 2</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-content">Community Profile</h2>
          <p className="mt-2 text-sm text-content-secondary">
            Tell us about your community so we can set up your account.
          </p>

          <div className="mt-8 space-y-8">
            {/* Primary field */}
            <div>
              <label htmlFor="name" className={LABEL_CLASS}>
                Community name
              </label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g., Sunset Condominium Association"
                required
              />
            </div>

            {/* Address group */}
            <div className="space-y-4">
              <p className={SECTION_LABEL_CLASS}>Address</p>

              <div>
                <label htmlFor="addressLine1" className={LABEL_CLASS}>
                  Street address
                </label>
                <Input
                  id="addressLine1"
                  type="text"
                  value={addressLine1}
                  onChange={(event) => setAddressLine1(event.target.value)}
                  placeholder="123 Ocean Drive"
                  required
                />
              </div>

              <div>
                <label htmlFor="addressLine2" className={LABEL_CLASS}>
                  Address line 2 <span className="font-normal text-content-tertiary">(optional)</span>
                </label>
                <Input
                  id="addressLine2"
                  type="text"
                  value={addressLine2}
                  onChange={(event) => setAddressLine2(event.target.value)}
                  placeholder="Suite, building, or additional details"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="city" className={LABEL_CLASS}>
                    City
                  </label>
                  <Input
                    id="city"
                    type="text"
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    placeholder="Miami"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="state" className={LABEL_CLASS}>
                    State
                  </label>
                  <Input
                    id="state"
                    type="text"
                    value={state}
                    onChange={(event) => setState(event.target.value)}
                    placeholder="FL"
                    maxLength={2}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="zipCode" className={LABEL_CLASS}>
                    ZIP code
                  </label>
                  <Input
                    id="zipCode"
                    type="text"
                    inputMode="numeric"
                    value={zipCode}
                    onChange={(event) => handleZipChange(event.target.value)}
                    onBlur={handleZipBlur}
                    aria-invalid={zipError || undefined}
                    className={cn(zipError && 'border-status-danger')}
                    placeholder="33139"
                    pattern="[0-9]{5}"
                    maxLength={5}
                    required
                  />
                  {zipError && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-status-danger">
                      <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      Enter a 5-digit ZIP code.
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="timezone" className={LABEL_CLASS}>
                    Timezone
                  </label>
                  <div className="relative">
                    <select
                      id="timezone"
                      value={timezone}
                      onChange={(event) => setTimezone(event.target.value)}
                      className="flex h-9 w-full appearance-none rounded-md border border-edge bg-transparent px-3 py-1 pr-9 text-base shadow-sm transition-colors duration-quick focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                      required
                    >
                      <option value="America/New_York">Eastern Time (ET)</option>
                      <option value="America/Chicago">Central Time (CT)</option>
                    </select>
                    <ChevronDown
                      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary"
                      aria-hidden="true"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Branding group */}
            <div className="space-y-3">
              <p className={SECTION_LABEL_CLASS}>
                Community logo <span className="font-normal normal-case tracking-normal text-content-tertiary">(optional)</span>
              </p>
              <label
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  'flex cursor-pointer items-center gap-4 rounded-md border-2 border-dashed border-edge-strong bg-surface-subtle p-4 transition-colors hover:border-interactive hover:bg-interactive-subtle',
                  isDragging && 'border-interactive bg-interactive-subtle',
                  logoFile && 'border-solid border-status-success-border bg-surface-card hover:border-status-success-border hover:bg-surface-card',
                )}
              >
                <span
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-interactive-subtle text-interactive',
                    logoFile && 'bg-status-success-subtle text-status-success',
                  )}
                >
                  {logoFile ? (
                    <Check className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <UploadCloud className="h-5 w-5" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0">
                  {logoFile ? (
                    <>
                      <span className="block truncate text-sm font-medium text-content">{logoFile.name}</span>
                      <span className="mt-0.5 block text-xs text-content-tertiary">Click to replace</span>
                    </>
                  ) : (
                    <>
                      <span className="block text-sm font-medium text-content">
                        <span className="text-interactive">Click to upload</span> or drag and drop
                      </span>
                      <span className="mt-0.5 block text-xs text-content-tertiary">
                        PNG, JPG, WEBP, or SVG up to 10MB
                      </span>
                    </>
                  )}
                </span>
                <input
                  id="logo"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                  onChange={(event) => handleLogoSelection(event.target.files?.[0] ?? null)}
                  className="sr-only"
                />
              </label>
              {logoPath && !logoFile && (
                <p className="text-xs text-content-secondary">Current logo path: {logoPath}</p>
              )}
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-6 flex items-start gap-2 rounded-md border border-status-danger-border bg-status-danger-bg p-3 text-sm text-status-danger"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}
        </div>
      </div>

      <WizardFooter note="Progress saves automatically">
        <Button type="submit" size="lg" loading={isSubmitting}>
          Next
          <ArrowRight aria-hidden="true" />
        </Button>
      </WizardFooter>
    </form>
  );
}
