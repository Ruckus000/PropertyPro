'use client';

/**
 * Demo Generator Wizard — three-step wizard to create branded demo instances.
 *
 * Step 1: Select template type (condo, HOA, apartment)
 * Step 2: Configure branding (name, colors, fonts, logo)
 * Step 3: Confirm & generate
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ALLOWED_FONTS } from '@propertypro/theme';
import { COMMUNITY_TYPE_DISPLAY_NAMES, type CommunityType } from '@propertypro/shared';
import { resolveTheme, toCssVars, toFontLinks } from '@propertypro/theme';
import { AdminLayout } from '@/components/AdminLayout';

type WizardStep = 1 | 2 | 3 | 'creating' | 'done';

interface DemoResult {
  demoId: number;
  slug: string;
  previewUrl: string;
  mobilePreviewUrl: string;
}

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

const DEFAULT_BRANDING = {
  primaryColor: '#2563EB',
  secondaryColor: '#6B7280',
  accentColor: '#DBEAFE',
  fontHeading: 'Inter',
  fontBody: 'Inter',
  logoPath: '',
};

export default function DemoNewPage() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(1);
  const [templateType, setTemplateType] = useState<CommunityType | null>(null);
  const [prospectName, setProspectName] = useState('');
  const [branding, setBranding] = useState(DEFAULT_BRANDING);
  const [externalCrmUrl, setExternalCrmUrl] = useState('');
  const [prospectNotes, setProspectNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DemoResult | null>(null);

  const updateBranding = (field: string, value: string) => {
    setBranding((prev) => ({ ...prev, [field]: value }));
  };

  const handleGenerate = async () => {
    if (!templateType) return;
    setStep('creating');
    setError(null);

    try {
      const res = await fetch('/api/admin/demos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateType,
          prospectName,
          branding: {
            primaryColor: branding.primaryColor,
            secondaryColor: branding.secondaryColor,
            accentColor: branding.accentColor,
            fontHeading: branding.fontHeading,
            fontBody: branding.fontBody,
            logoPath: branding.logoPath || undefined,
          },
          externalCrmUrl: externalCrmUrl || undefined,
          prospectNotes: prospectNotes || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message ?? 'Failed to create demo');
      }

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
    prospectName || 'Your Community',
    templateType ?? 'condo_718',
  );
  const cssVars = toCssVars(theme);
  const fontLinks = toFontLinks(theme);

  return (
    <AdminLayout>
      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/demo" className="text-sm text-gray-500 hover:text-gray-700">
            ← Back to Demos
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">Create Demo</h1>

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

        {/* Step 1: Template Selection */}
        {step === 1 && (
          <div>
            <h2 className="mb-4 text-lg font-semibold text-gray-800">Choose Template</h2>
            <div className="grid grid-cols-3 gap-4">
              {TEMPLATE_OPTIONS.map((opt) => (
                <button
                  key={opt.type}
                  onClick={() => setTemplateType(opt.type)}
                  className={`rounded-lg border-2 p-6 text-left transition-all ${
                    templateType === opt.type
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-3xl mb-3">{opt.icon}</div>
                  <div className="font-semibold text-gray-900">{opt.label}</div>
                  <div className="mt-1 text-sm text-gray-500">{opt.description}</div>
                </button>
              ))}
            </div>
            <div className="mt-8 flex justify-end">
              <button
                onClick={() => setStep(2)}
                disabled={!templateType}
                className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-blue-700"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Brand Configuration */}
        {step === 2 && (
          <div className="grid grid-cols-5 gap-8">
            <div className="col-span-3 space-y-5">
              <h2 className="text-lg font-semibold text-gray-800">Brand Configuration</h2>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Prospect Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={prospectName}
                  onChange={(e) => setProspectName(e.target.value)}
                  maxLength={100}
                  placeholder="e.g., Bayview Towers"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

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
                  disabled={!prospectName.trim()}
                  className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-blue-700"
                >
                  Next
                </button>
              </div>
            </div>

            {/* Live Preview */}
            <div className="col-span-2">
              <h3 className="mb-3 text-sm font-medium text-gray-500">Live Preview</h3>
              {/* eslint-disable-next-line @next/next/no-head-element */}
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
                    {prospectName || 'Your Community'}
                  </h2>
                  <p className="text-sm opacity-80">
                    {templateType ? COMMUNITY_TYPE_DISPLAY_NAMES[templateType] : 'Community'}
                  </p>
                </div>
                <div className="p-4" style={{ fontFamily: 'var(--theme-font-body)' }}>
                  <p className="text-sm text-gray-600">
                    Sample body text in the selected font. This is how content will appear in the demo portal.
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

        {/* Step 3: Confirm & Generate */}
        {step === 3 && (
          <div className="max-w-xl">
            <h2 className="mb-4 text-lg font-semibold text-gray-800">Confirm & Generate</h2>

            {error && (
              <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Template</span>
                <span className="font-medium">
                  {templateType ? COMMUNITY_TYPE_DISPLAY_NAMES[templateType] : '—'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Prospect Name</span>
                <span className="font-medium">{prospectName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Primary Color</span>
                <span className="flex items-center gap-2 font-mono text-xs">
                  <span
                    className="inline-block h-4 w-4 rounded"
                    style={{ backgroundColor: branding.primaryColor }}
                  />
                  {branding.primaryColor}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Fonts</span>
                <span className="font-medium text-xs">
                  {branding.fontHeading} / {branding.fontBody}
                </span>
              </div>
            </div>

            {/* Optional fields */}
            <div className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  CRM Link <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="url"
                  value={externalCrmUrl}
                  onChange={(e) => setExternalCrmUrl(e.target.value)}
                  placeholder="https://crm.example.com/deal/123"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Notes <span className="text-gray-400">(optional)</span>
                </label>
                <textarea
                  value={prospectNotes}
                  onChange={(e) => setProspectNotes(e.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder="Internal notes about this prospect..."
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="rounded-md border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={handleGenerate}
                className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Generate Demo
              </button>
            </div>
          </div>
        )}

        {/* Creating state */}
        {step === 'creating' && (
          <div className="flex flex-col items-center py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
            <p className="mt-4 text-sm text-gray-500">
              Generating demo for {prospectName}...
            </p>
            <p className="mt-1 text-xs text-gray-400">This may take 10-15 seconds</p>
          </div>
        )}

        {/* Done state */}
        {step === 'done' && result && (
          <div className="max-w-xl">
            <div className="rounded-lg border border-green-200 bg-green-50 p-6">
              <h2 className="text-lg font-semibold text-green-900">
                Demo created for {prospectName}
              </h2>
              <p className="mt-1 text-sm text-green-700">
                The demo community is ready with sample data.
              </p>

              <div className="mt-4 space-y-2">
                <Link
                  href={result.previewUrl}
                  className="block rounded-md bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
                >
                  Open Split-Screen Preview
                </Link>
                <Link
                  href={result.mobilePreviewUrl}
                  className="block rounded-md border border-gray-300 px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Open Mobile Preview
                </Link>
              </div>

              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => {
                    setStep(1);
                    setTemplateType(null);
                    setProspectName('');
                    setBranding(DEFAULT_BRANDING);
                    setExternalCrmUrl('');
                    setProspectNotes('');
                    setError(null);
                    setResult(null);
                  }}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  Create Another
                </button>
                <button
                  onClick={() => router.push('/demo')}
                  className="text-sm font-medium text-gray-500 hover:text-gray-700"
                >
                  View All Demos
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
