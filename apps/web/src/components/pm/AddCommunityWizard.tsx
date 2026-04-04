'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Building2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WizardData {
  name: string;
  communityType: '' | 'condo_718' | 'hoa_720' | 'apartment';
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  subdomain: string;
  timezone: string;
  unitCount: string;
}

const INITIAL_DATA: WizardData = {
  name: '',
  communityType: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: 'FL',
  zipCode: '',
  subdomain: '',
  timezone: 'America/New_York',
  unitCount: '',
};

const TYPE_OPTIONS = [
  { value: 'condo_718', label: 'Condominium (§718)' },
  { value: 'hoa_720', label: 'HOA (§720)' },
  { value: 'apartment', label: 'Apartment' },
] as const;

const STEPS = ['Basics', 'Units', 'Review'] as const;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-3" role="navigation" aria-label="Wizard steps">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          {i > 0 && <div className="h-px w-6 bg-edge" aria-hidden="true" />}
          <div
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
              i === current
                ? 'bg-interactive-primary text-white'
                : i < current
                  ? 'bg-interactive-subtle text-interactive-primary'
                  : 'bg-surface-muted text-content-tertiary',
            )}
          >
            {i + 1}
          </div>
          <span
            className={cn(
              'text-sm font-medium',
              i === current ? 'text-content' : 'text-content-tertiary',
            )}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

function InputField({
  label,
  required,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; required?: boolean }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-content">
        {label}{required && <span className="text-status-danger"> *</span>}
      </label>
      <input
        {...props}
        className="w-full rounded-sm border border-edge bg-surface-card px-3 py-2 text-sm text-content placeholder:text-content-placeholder focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
      />
    </div>
  );
}

function SelectField({
  label,
  required,
  options,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  required?: boolean;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-content">
        {label}{required && <span className="text-status-danger"> *</span>}
      </label>
      <select
        {...props}
        className="w-full rounded-sm border border-edge bg-surface-card px-3 py-2 text-sm text-content focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
      >
        <option value="">Select...</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function BasicsStep({
  data,
  onChange,
}: {
  data: WizardData;
  onChange: (patch: Partial<WizardData>) => void;
}) {
  return (
    <div className="space-y-4">
      <InputField
        label="Community Name"
        required
        value={data.name}
        onChange={(e) => {
          const name = e.target.value;
          onChange({
            name,
            subdomain: data.subdomain === slugify(data.name) || !data.subdomain
              ? slugify(name)
              : data.subdomain,
          });
        }}
        placeholder="e.g. Oceanview Towers HOA"
      />
      <SelectField
        label="Community Type"
        required
        value={data.communityType}
        onChange={(e) => onChange({ communityType: e.target.value as WizardData['communityType'] })}
        options={TYPE_OPTIONS}
      />
      <InputField
        label="Address"
        required
        value={data.addressLine1}
        onChange={(e) => onChange({ addressLine1: e.target.value })}
        placeholder="123 Ocean Blvd"
      />
      <InputField
        label="Address Line 2"
        value={data.addressLine2}
        onChange={(e) => onChange({ addressLine2: e.target.value })}
        placeholder="Suite, unit, etc. (optional)"
      />
      <div className="grid grid-cols-3 gap-3">
        <InputField
          label="City"
          required
          value={data.city}
          onChange={(e) => onChange({ city: e.target.value })}
        />
        <InputField
          label="State"
          required
          value={data.state}
          onChange={(e) => onChange({ state: e.target.value })}
          maxLength={2}
        />
        <InputField
          label="Zip Code"
          required
          value={data.zipCode}
          onChange={(e) => onChange({ zipCode: e.target.value })}
          maxLength={10}
        />
      </div>
      <div>
        <InputField
          label="Subdomain"
          required
          value={data.subdomain}
          onChange={(e) => onChange({ subdomain: e.target.value })}
        />
        <p className="mt-1 text-xs text-content-tertiary">
          {data.subdomain ? `${data.subdomain}.getpropertypro.com` : 'your-community.getpropertypro.com'}
        </p>
      </div>
    </div>
  );
}

function UnitsStep({
  data,
  onChange,
}: {
  data: WizardData;
  onChange: (patch: Partial<WizardData>) => void;
}) {
  return (
    <div className="space-y-4">
      <InputField
        label="Number of Units"
        required
        type="number"
        min={1}
        value={data.unitCount}
        onChange={(e) => onChange({ unitCount: e.target.value })}
        placeholder="e.g. 48"
      />
      <p className="text-sm text-content-secondary">
        You can add and configure individual units after the community is set up.
      </p>
    </div>
  );
}

function ReviewStep({ data }: { data: WizardData }) {
  const typeLabel = TYPE_OPTIONS.find((o) => o.value === data.communityType)?.label ?? data.communityType;

  return (
    <div className="rounded-md border border-edge bg-surface-card p-5">
      <h3 className="text-base font-semibold text-content">Review</h3>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div>
          <dt className="text-content-tertiary">Name</dt>
          <dd className="mt-0.5 font-medium text-content">{data.name}</dd>
        </div>
        <div>
          <dt className="text-content-tertiary">Type</dt>
          <dd className="mt-0.5 font-medium text-content">{typeLabel}</dd>
        </div>
        <div>
          <dt className="text-content-tertiary">Address</dt>
          <dd className="mt-0.5 font-medium text-content">
            {data.addressLine1}{data.addressLine2 ? `, ${data.addressLine2}` : ''}
            <br />{data.city}, {data.state} {data.zipCode}
          </dd>
        </div>
        <div>
          <dt className="text-content-tertiary">Subdomain</dt>
          <dd className="mt-0.5 font-medium text-content">{data.subdomain}.getpropertypro.com</dd>
        </div>
        <div>
          <dt className="text-content-tertiary">Units</dt>
          <dd className="mt-0.5 font-medium text-content">{data.unitCount}</dd>
        </div>
      </dl>
    </div>
  );
}

function validateBasics(data: WizardData): string | null {
  if (!data.name.trim()) return 'Community name is required';
  if (!data.communityType) return 'Community type is required';
  if (!data.addressLine1.trim()) return 'Address is required';
  if (!data.city.trim()) return 'City is required';
  if (!data.state.trim() || data.state.length !== 2) return 'State is required (2 letters)';
  if (!data.zipCode.trim() || data.zipCode.length < 5) return 'Zip code is required';
  if (!data.subdomain.trim() || data.subdomain.length < 3) return 'Subdomain must be at least 3 characters';
  return null;
}

function validateUnits(data: WizardData): string | null {
  const count = parseInt(data.unitCount, 10);
  if (!data.unitCount || isNaN(count) || count < 1) return 'Unit count must be at least 1';
  return null;
}

export function AddCommunityWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onChange = useCallback((patch: Partial<WizardData>) => {
    setData((prev) => ({ ...prev, ...patch }));
    setError(null);
  }, []);

  function handleNext() {
    if (step === 0) {
      const err = validateBasics(data);
      if (err) { setError(err); return; }
    }
    if (step === 1) {
      const err = validateUnits(data);
      if (err) { setError(err); return; }
    }
    setStep((s) => s + 1);
  }

  function handleBack() {
    setError(null);
    setStep((s) => s - 1);
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/pm/communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name.trim(),
          communityType: data.communityType,
          addressLine1: data.addressLine1.trim(),
          addressLine2: data.addressLine2.trim() || undefined,
          city: data.city.trim(),
          state: data.state.trim().toUpperCase(),
          zipCode: data.zipCode.trim(),
          subdomain: data.subdomain.trim(),
          timezone: data.timezone,
          unitCount: parseInt(data.unitCount, 10),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error?.message ?? 'Failed to create community');
        return;
      }

      const { communityId } = json.data;
      const dashboardPath =
        data.communityType === 'apartment'
          ? `/dashboard/apartment?communityId=${communityId}`
          : `/dashboard?communityId=${communityId}`;
      router.push(dashboardPath);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/pm/dashboard/communities"
        className="inline-flex items-center gap-1.5 text-sm text-content-secondary hover:text-content"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Communities
      </Link>

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-muted">
          <Building2 className="h-5 w-5 text-content-secondary" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-content">Add Community</h1>
          <p className="text-sm text-content-secondary">Set up a new association in your portfolio</p>
        </div>
      </div>

      <StepIndicator current={step} />

      {error && (
        <div className="rounded-md border border-status-danger-border bg-status-danger-bg px-4 py-3 text-sm text-status-danger" role="alert">
          {error}
        </div>
      )}

      <div className="rounded-md border border-edge bg-surface-card p-6">
        {step === 0 && <BasicsStep data={data} onChange={onChange} />}
        {step === 1 && <UnitsStep data={data} onChange={onChange} />}
        {step === 2 && <ReviewStep data={data} />}
      </div>

      <div className="flex items-center justify-between">
        {step > 0 ? (
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 rounded-md border border-edge px-4 py-2 text-sm font-medium text-content hover:bg-surface-subtle"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        ) : (
          <div />
        )}

        {step < 2 ? (
          <button
            type="button"
            onClick={handleNext}
            className="inline-flex items-center gap-1.5 rounded-md bg-interactive-primary px-4 py-2 text-sm font-semibold text-white hover:bg-interactive-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          >
            Next
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 rounded-md bg-interactive-primary px-4 py-2 text-sm font-semibold text-white hover:bg-interactive-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Community'
            )}
          </button>
        )}
      </div>
    </div>
  );
}
