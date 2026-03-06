'use client';

/**
 * Create Client Wizard — three-step wizard to onboard a new client community.
 *
 * Step 1: Community details (name, type, slug, address, plan)
 * Step 2: Branding (colors, fonts, logo)
 * Step 3: Review & create (summary + optional initial admin invite)
 */
import { useCallback, useReducer, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ALLOWED_FONTS } from '@propertypro/theme';
import { COMMUNITY_TYPE_DISPLAY_NAMES, type CommunityType } from '@propertypro/shared';
import { resolveTheme, toCssVars, toFontLinks } from '@propertypro/theme';
import { AdminLayout } from '@/components/AdminLayout';
import { CreateClientSuccessState } from '@/components/clients/CreateClientSuccessState';
import type { CreateClientResult } from '@/components/clients/types';
import { extractApiError } from '@/lib/http/extract-api-error';

type WizardStep = 1 | 2 | 3 | 'creating' | 'done';

const TEMPLATE_OPTIONS: Array<{
  type: CommunityType;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    type: 'condo_718',
    label: 'Condo §718',
    description: 'Florida condominium association with 25+ units',
    icon: '🏢',
  },
  {
    type: 'hoa_720',
    label: 'HOA §720',
    description: 'Homeowners association with 100+ parcels',
    icon: '🏘️',
  },
  {
    type: 'apartment',
    label: 'Apartment',
    description: 'Apartment community with on-site management',
    icon: '🏬',
  },
];

const PLAN_OPTIONS = [
  { value: 'starter', label: 'Starter', price: '$99/mo' },
  { value: 'professional', label: 'Professional', price: '$199/mo' },
  { value: 'enterprise', label: 'Enterprise', price: '$399/mo' },
];

const DEFAULT_BRANDING = {
  primaryColor: '#2563EB',
  secondaryColor: '#6B7280',
  accentColor: '#DBEAFE',
  fontHeading: 'Inter',
  fontBody: 'Inter',
  logoPath: '',
};

const ADMIN_ROLE_OPTIONS = [
  { value: 'board_president', label: 'Board President' },
  { value: 'board_member', label: 'Board Member' },
  { value: 'cam', label: 'Community Association Manager' },
  { value: 'site_manager', label: 'Site Manager' },
] as const;

type CreateClientFormState = {
  name: string;
  communityType: CommunityType | null;
  slug: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  unitCount: string;
  plan: string;
  branding: typeof DEFAULT_BRANDING;
  adminEmail: string;
  adminRole: typeof ADMIN_ROLE_OPTIONS[number]['value'];
};

type CreateClientFormAction =
  | { type: 'reset' }
  | { type: 'setValues'; values: Partial<CreateClientFormState> }
  | { type: 'setBranding'; field: keyof CreateClientFormState['branding']; value: string };

function createInitialCreateClientForm(): CreateClientFormState {
  return {
    name: '',
    communityType: null,
    slug: '',
    address: '',
    city: '',
    state: 'FL',
    zipCode: '',
    unitCount: '',
    plan: 'professional',
    branding: { ...DEFAULT_BRANDING },
    adminEmail: '',
    adminRole: 'board_president',
  };
}

function createClientFormReducer(
  state: CreateClientFormState,
  action: CreateClientFormAction,
): CreateClientFormState {
  switch (action.type) {
    case 'reset':
      return createInitialCreateClientForm();
    case 'setValues':
      return { ...state, ...action.values };
    case 'setBranding':
      return {
        ...state,
        branding: {
          ...state.branding,
          [action.field]: action.value,
        },
      };
    default:
      return state;
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 63);
}

export default function CreateClientPage() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(1);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateClientResult | null>(null);
  const [form, dispatchForm] = useReducer(
    createClientFormReducer,
    undefined,
    createInitialCreateClientForm,
  );

  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);
  const {
    name,
    communityType,
    slug,
    address,
    city,
    state,
    zipCode,
    unitCount,
    plan,
    branding,
    adminEmail,
    adminRole,
  } = form;

  const handleNameChange = (value: string) => {
    const nextValues: Partial<CreateClientFormState> = { name: value };
    if (!slugManuallyEdited) {
      nextValues.slug = slugify(value);
      setSlugAvailable(null);
    }
    dispatchForm({ type: 'setValues', values: nextValues });
  };

  const handleSlugChange = (value: string) => {
    setSlugManuallyEdited(true);
    const sanitized = value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 63);

    dispatchForm({
      type: 'setValues',
      values: { slug: sanitized },
    });
    setSlugAvailable(null);
  };

  const checkSlug = useCallback(async () => {
    if (!slug || slug.length < 2) return;
    setSlugChecking(true);
    try {
      const res = await fetch(`/api/admin/clients?slug=${encodeURIComponent(slug)}`);
      const json = await res.json();
      setSlugAvailable(json.data?.available ?? null);
    } catch {
      setSlugAvailable(null);
    } finally {
      setSlugChecking(false);
    }
  }, [slug]);

  const updateBranding = (field: string, value: string) => {
    dispatchForm({
      type: 'setBranding',
      field: field as keyof CreateClientFormState['branding'],
      value,
    });
  };

  const resetWizard = useCallback(() => {
    setStep(1);
    dispatchForm({ type: 'reset' });
    setSlugManuallyEdited(false);
    setSlugAvailable(null);
    setSlugChecking(false);
    setError(null);
    setResult(null);
  }, []);

  const canProceedStep1 =
    name.trim().length > 0 &&
    communityType !== null &&
    slug.length >= 2;
  const canCreate = canProceedStep1;

  const handleCreate = async () => {
    if (!communityType) return;
    setStep('creating');
    setError(null);

    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          slug,
          communityType,
          address: address || undefined,
          city: city || undefined,
          state,
          zipCode: zipCode || undefined,
          unitCount: unitCount ? parseInt(unitCount, 10) : undefined,
          subscriptionPlan: plan || undefined,
          branding: {
            primaryColor: branding.primaryColor,
            secondaryColor: branding.secondaryColor,
            accentColor: branding.accentColor,
            fontHeading: branding.fontHeading,
            fontBody: branding.fontBody,
            logoPath: branding.logoPath || undefined,
          },
          initialAdmin: adminEmail
            ? { email: adminEmail, role: adminRole }
            : undefined,
        }),
      });

      if (!res.ok) {
        throw new Error(await extractApiError(res));
      }

      const json = await res.json();
      setResult(json.data);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStep(3);
    }
  };

  const theme = resolveTheme(
    {
      primaryColor: branding.primaryColor,
      secondaryColor: branding.secondaryColor,
      accentColor: branding.accentColor,
      fontHeading: branding.fontHeading,
      fontBody: branding.fontBody,
    },
    name || 'Your Community',
    communityType ?? 'condo_718',
  );
  const cssVars = toCssVars(theme);
  const fontLinks = toFontLinks(theme);

  return (
    <AdminLayout>
      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/clients" className="text-sm text-gray-500 hover:text-gray-700">
            &larr; Back to Clients
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">Create New Client</h1>
          <p className="mt-1 text-sm text-gray-500">
            Set up a new community on the platform
          </p>

          {/* Step indicator */}
          {typeof step === 'number' && (
            <div className="mt-4 flex gap-2">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={`h-1.5 flex-1 rounded-full ${
                    s <= step ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Step 1: Community Details */}
        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-800">Community Details</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Community Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                maxLength={200}
                placeholder="e.g., Coral Gables Condominium Association"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Community Type <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-4">
                {TEMPLATE_OPTIONS.map((opt) => (
                  <button
                    key={opt.type}
                    onClick={() => dispatchForm({ type: 'setValues', values: { communityType: opt.type } })}
                    className={`rounded-lg border-2 p-5 text-left transition-all ${
                      communityType === opt.type
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-2xl mb-2">{opt.icon}</div>
                    <div className="text-sm font-semibold text-gray-900">{opt.label}</div>
                    <div className="mt-1 text-xs text-gray-500">{opt.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Subdomain Slug <span className="text-red-500">*</span>
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  onBlur={checkSlug}
                  maxLength={63}
                  placeholder="coral-gables-condo"
                  className="w-64 rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-400">.propertyprofl.com</span>
              </div>
              {slugChecking && (
                <p className="mt-1 text-xs text-gray-400">Checking availability...</p>
              )}
              {slugAvailable === true && (
                <p className="mt-1 text-xs text-green-600">Available</p>
              )}
              {slugAvailable === false && (
                <p className="mt-1 text-xs text-red-600">This slug is already in use</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => dispatchForm({ type: 'setValues', values: { address: e.target.value } })}
                  placeholder="1200 Coral Way"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">City</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => dispatchForm({ type: 'setValues', values: { city: e.target.value } })}
                  placeholder="Coral Gables"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">State</label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => dispatchForm({ type: 'setValues', values: { state: e.target.value } })}
                  maxLength={2}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">ZIP Code</label>
                <input
                  type="text"
                  value={zipCode}
                  onChange={(e) => dispatchForm({ type: 'setValues', values: { zipCode: e.target.value } })}
                  maxLength={10}
                  placeholder="33134"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Unit Count</label>
                <input
                  type="number"
                  value={unitCount}
                  onChange={(e) => dispatchForm({ type: 'setValues', values: { unitCount: e.target.value } })}
                  min={1}
                  placeholder="48"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Subscription Plan
              </label>
              <select
                value={plan}
                onChange={(e) => dispatchForm({ type: 'setValues', values: { plan: e.target.value } })}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {PLAN_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label} — {p.price}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => { checkSlug(); setStep(2); }}
                disabled={!canProceedStep1}
                className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-blue-700"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Branding */}
        {step === 2 && (
          <div className="grid grid-cols-5 gap-8">
            <div className="col-span-3 space-y-5">
              <h2 className="text-lg font-semibold text-gray-800">Branding</h2>

              {/* Color pickers */}
              {[
                { field: 'primaryColor', label: 'Primary Color' },
                { field: 'secondaryColor', label: 'Secondary Color' },
                { field: 'accentColor', label: 'Accent Color' },
              ].map(({ field, label }) => (
                <div key={field}>
                  <label className="block text-sm font-medium text-gray-700">{label}</label>
                  <div className="mt-1 flex items-center gap-3">
                    <input
                      type="color"
                      value={branding[field as keyof typeof branding]}
                      onChange={(e) => updateBranding(field, e.target.value)}
                      className="h-9 w-12 cursor-pointer rounded border border-gray-300"
                    />
                    <input
                      type="text"
                      value={branding[field as keyof typeof branding]}
                      onChange={(e) => updateBranding(field, e.target.value)}
                      className="w-28 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-mono"
                    />
                  </div>
                </div>
              ))}

              {/* Font selectors */}
              {[
                { field: 'fontHeading', label: 'Heading Font' },
                { field: 'fontBody', label: 'Body Font' },
              ].map(({ field, label }) => (
                <div key={field}>
                  <label className="block text-sm font-medium text-gray-700">{label}</label>
                  <select
                    value={branding[field as keyof typeof branding]}
                    onChange={(e) => updateBranding(field, e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {ALLOWED_FONTS.map((font) => (
                      <option key={font} value={font}>
                        {font}
                      </option>
                    ))}
                  </select>
                </div>
              ))}

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setStep(1)}
                  className="rounded-md border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Next
                </button>
              </div>
            </div>

            {/* Live Preview */}
            <div className="col-span-2">
              <h3 className="mb-3 text-sm font-medium text-gray-500">Live Preview</h3>
              {fontLinks.map((href) => (
                // eslint-disable-next-line @next/next/no-page-custom-font
                <link key={href} rel="stylesheet" href={href} />
              ))}
              <div
                className="overflow-hidden rounded-lg border border-gray-200 shadow-sm"
                style={cssVars as React.CSSProperties}
              >
                <div
                  className="px-4 py-3 text-white"
                  style={{ backgroundColor: 'var(--theme-primary)' }}
                >
                  <h2
                    className="text-lg font-bold"
                    style={{ fontFamily: 'var(--theme-font-heading)' }}
                  >
                    {name || 'Your Community'}
                  </h2>
                  <p className="text-sm opacity-80">
                    {communityType
                      ? COMMUNITY_TYPE_DISPLAY_NAMES[communityType]
                      : 'Community'}
                  </p>
                </div>
                <div className="p-4" style={{ fontFamily: 'var(--theme-font-body)' }}>
                  <p className="text-sm text-gray-600">
                    Sample body text showing how your community portal will look with
                    the selected branding.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <span
                      className="inline-block rounded px-3 py-1 text-xs font-medium text-white"
                      style={{ backgroundColor: 'var(--theme-primary)' }}
                    >
                      Primary
                    </span>
                    <span
                      className="inline-block rounded px-3 py-1 text-xs font-medium text-white"
                      style={{ backgroundColor: 'var(--theme-secondary)' }}
                    >
                      Secondary
                    </span>
                    <span
                      className="inline-block rounded border px-3 py-1 text-xs font-medium"
                      style={{
                        backgroundColor: 'var(--theme-accent)',
                        color: 'var(--theme-primary)',
                      }}
                    >
                      Accent
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Review & Create */}
        {step === 3 && (
          <div className="max-w-xl space-y-6">
            <h2 className="text-lg font-semibold text-gray-800">Review &amp; Create</h2>

            {error && (
              <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Community Details Summary */}
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Community Details
                </h3>
                <button
                  onClick={() => setStep(1)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  Edit
                </button>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Name</dt>
                  <dd className="font-medium text-gray-900">{name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Type</dt>
                  <dd className="font-medium text-gray-900">
                    {communityType ? COMMUNITY_TYPE_DISPLAY_NAMES[communityType] : '—'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Slug</dt>
                  <dd className="font-mono text-xs text-gray-900">
                    {slug}.propertyprofl.com
                  </dd>
                </div>
                {(address || city) && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Address</dt>
                    <dd className="font-medium text-gray-900 text-right">
                      {[address, city, state, zipCode].filter(Boolean).join(', ')}
                    </dd>
                  </div>
                )}
                {unitCount && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Units</dt>
                    <dd className="font-medium text-gray-900">{unitCount}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-gray-500">Plan</dt>
                  <dd className="font-medium text-gray-900">
                    {PLAN_OPTIONS.find((p) => p.value === plan)?.label ?? plan}{' '}
                    <span className="text-gray-400">
                      ({PLAN_OPTIONS.find((p) => p.value === plan)?.price})
                    </span>
                  </dd>
                </div>
              </dl>
            </div>

            {/* Branding Summary */}
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Branding
                </h3>
                <button
                  onClick={() => setStep(2)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  Edit
                </button>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-4 w-4 rounded"
                    style={{ backgroundColor: branding.primaryColor }}
                  />
                  <span className="font-mono text-xs text-gray-500">{branding.primaryColor}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-4 w-4 rounded"
                    style={{ backgroundColor: branding.secondaryColor }}
                  />
                  <span className="font-mono text-xs text-gray-500">{branding.secondaryColor}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-4 w-4 rounded"
                    style={{ backgroundColor: branding.accentColor }}
                  />
                  <span className="font-mono text-xs text-gray-500">{branding.accentColor}</span>
                </div>
                <span className="text-xs text-gray-400">
                  {branding.fontHeading} / {branding.fontBody}
                </span>
              </div>
            </div>

            {/* Initial Admin Invite */}
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                Initial Admin <span className="text-gray-400">(optional)</span>
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => dispatchForm({ type: 'setValues', values: { adminEmail: e.target.value } })}
                    placeholder="president@community.com"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Role
                  </label>
                  <select
                    value={adminRole}
                    onChange={(e) => dispatchForm({
                      type: 'setValues',
                      values: { adminRole: e.target.value as typeof adminRole },
                    })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {ADMIN_ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {adminEmail && (
                <p className="mt-2 text-xs text-gray-400">
                  An invitation email will be sent to this address.
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setStep(2)}
                className="rounded-md border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={handleCreate}
                disabled={!canCreate}
                className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-blue-700"
              >
                Create Community
              </button>
            </div>
          </div>
        )}

        {/* Creating state */}
        {step === 'creating' && (
          <div className="flex flex-col items-center py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
            <p className="mt-4 text-sm text-gray-500">
              Creating {name}...
            </p>
          </div>
        )}

        {/* Done state */}
        {step === 'done' && result && (
          <CreateClientSuccessState
            result={result}
            adminEmail={adminEmail}
            onBackToClients={() => router.push('/clients')}
            onResetWizard={resetWizard}
          />
        )}
      </div>
    </AdminLayout>
  );
}
