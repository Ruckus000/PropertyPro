'use client';

/**
 * Demo Edit Page — edit prospect name, branding, CRM link, and notes.
 *
 * Reuses the branding form pattern from the creation wizard (step 2 + 3)
 * with a single-page layout and live preview panel.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ALLOWED_FONTS } from '@propertypro/theme';
import { COMMUNITY_TYPE_DISPLAY_NAMES, type CommunityType } from '@propertypro/shared';
import { resolveTheme, toCssVars, toFontLinks } from '@propertypro/theme';
import { AdminLayout } from '@/components/AdminLayout';
import { TypeBadge } from '@/components/demo/TypeBadge';

interface DemoData {
  id: number;
  template_type: string;
  prospect_name: string;
  slug: string;
  theme: {
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    fontHeading?: string;
    fontBody?: string;
    logoPath?: string;
  } | null;
  external_crm_url: string | null;
  prospect_notes: string | null;
}

const DEFAULT_BRANDING = {
  primaryColor: '#2563EB',
  secondaryColor: '#6B7280',
  accentColor: '#DBEAFE',
  fontHeading: 'Inter',
  fontBody: 'Inter',
  logoPath: '',
};

export default function DemoEditPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const demoId = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState<DemoData | null>(null);

  // Form state
  const [prospectName, setProspectName] = useState('');
  const [branding, setBranding] = useState(DEFAULT_BRANDING);
  const [externalCrmUrl, setExternalCrmUrl] = useState('');
  const [prospectNotes, setProspectNotes] = useState('');

  // Load demo data
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/admin/demos/${demoId}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load demo');

        const d = json.data as DemoData;
        setDemo(d);
        setProspectName(d.prospect_name);
        setBranding({
          primaryColor: d.theme?.primaryColor ?? DEFAULT_BRANDING.primaryColor,
          secondaryColor: d.theme?.secondaryColor ?? DEFAULT_BRANDING.secondaryColor,
          accentColor: d.theme?.accentColor ?? DEFAULT_BRANDING.accentColor,
          fontHeading: d.theme?.fontHeading ?? DEFAULT_BRANDING.fontHeading,
          fontBody: d.theme?.fontBody ?? DEFAULT_BRANDING.fontBody,
          logoPath: d.theme?.logoPath ?? '',
        });
        setExternalCrmUrl(d.external_crm_url ?? '');
        setProspectNotes(d.prospect_notes ?? '');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [demoId]);

  const updateBranding = (field: string, value: string) => {
    setBranding((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/demos/${demoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospectName,
          theme: {
            primaryColor: branding.primaryColor,
            secondaryColor: branding.secondaryColor,
            accentColor: branding.accentColor,
            fontHeading: branding.fontHeading,
            fontBody: branding.fontBody,
            logoPath: branding.logoPath || undefined,
          },
          externalCrmUrl: externalCrmUrl || '',
          prospectNotes: prospectNotes || '',
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to save');

      router.push(`/demo/${demoId}/preview`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setSaving(false);
    }
  };

  // Live branding preview
  const theme = resolveTheme(
    {
      primaryColor: branding.primaryColor,
      secondaryColor: branding.secondaryColor,
      accentColor: branding.accentColor,
      fontHeading: branding.fontHeading,
      fontBody: branding.fontBody,
    },
    prospectName || 'Your Community',
    (demo?.template_type as CommunityType) ?? 'condo_718',
  );
  const cssVars = toCssVars(theme);
  const fontLinks = toFontLinks(theme);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  if (!demo) {
    return (
      <AdminLayout>
        <div className="px-6 py-8 text-center text-gray-500">Demo not found.</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href={`/demo/${demoId}/preview`} className="text-sm text-gray-500 hover:text-gray-700">
            &larr; Back to Preview
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Edit Demo</h1>
            <TypeBadge type={demo.template_type} />
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {/* Two-column layout: form + live preview */}
        <div className="grid grid-cols-5 gap-8">
          <div className="col-span-3 space-y-5">
            {/* Prospect Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Prospect Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={prospectName}
                onChange={(e) => setProspectName(e.target.value)}
                maxLength={100}
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

            {/* CRM Link */}
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

            {/* Notes */}
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

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Link
                href={`/demo/${demoId}/preview`}
                className="rounded-md border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </Link>
              <button
                onClick={handleSave}
                disabled={saving || !prospectName.trim()}
                className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-blue-700"
              >
                {saving ? 'Saving...' : 'Save Changes'}
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
                  {prospectName || 'Your Community'}
                </h2>
                <p className="text-sm opacity-80">
                  {COMMUNITY_TYPE_DISPLAY_NAMES[demo.template_type as CommunityType] ?? demo.template_type}
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
      </div>
    </AdminLayout>
  );
}
