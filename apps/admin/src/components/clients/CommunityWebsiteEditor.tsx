'use client';

/**
 * Community Website Editor — branding form with live preview.
 *
 * Allows platform admins to customise a community's public-facing landing page
 * branding: colors, fonts, and logo. Includes theme preset quick-picks.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Save, RotateCcw, Upload, X } from 'lucide-react';
import type { CommunityBranding } from '@propertypro/shared';
import {
  ALLOWED_FONTS,
  THEME_DEFAULTS,
  THEME_PRESETS,
  presetToBranding,
  darkenHex,
} from '@propertypro/theme';

// ---------------------------------------------------------------------------
// Magic-byte validation (client-side, matches admin upload route)
// ---------------------------------------------------------------------------

const MAGIC_SIGS: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/webp', bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 },
];

function detectImageMime(buf: Uint8Array): string | null {
  for (const sig of MAGIC_SIGS) {
    const start = sig.offset ?? 0;
    if (buf.length < start + sig.bytes.length) continue;
    if (sig.bytes.every((b, i) => buf[start + i] === b)) return sig.mime;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommunityWebsiteEditorProps {
  communityId: number;
  communitySlug: string;
}

interface BrandingForm {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontHeading: string;
  fontBody: string;
  logoPath: string;
}

const MAX_LOGO_SIZE = 5 * 1024 * 1024; // 5 MB

function brandingToForm(b: CommunityBranding): BrandingForm {
  return {
    primaryColor: b.primaryColor ?? THEME_DEFAULTS.primaryColor,
    secondaryColor: b.secondaryColor ?? THEME_DEFAULTS.secondaryColor,
    accentColor: b.accentColor ?? THEME_DEFAULTS.accentColor,
    fontHeading: b.fontHeading ?? THEME_DEFAULTS.fontHeading,
    fontBody: b.fontBody ?? THEME_DEFAULTS.fontBody,
    logoPath: b.logoPath ?? '',
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommunityWebsiteEditor({ communityId, communitySlug }: CommunityWebsiteEditorProps) {
  const [form, setForm] = useState<BrandingForm>(brandingToForm({}));
  const [initial, setInitial] = useState<BrandingForm>(brandingToForm({}));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Logo preview (local object URL before upload)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [logoPublicUrl, setLogoPublicUrl] = useState<string | null>(null);
  const logoObjectUrlRef = useRef<string | null>(null);

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      if (logoObjectUrlRef.current) URL.revokeObjectURL(logoObjectUrlRef.current);
    };
  }, []);

  // Fetch current branding on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/admin/communities/${communityId}/branding`);
        if (!res.ok) throw new Error('Failed to load branding');
        const data = await res.json();
        const branding = data.branding as CommunityBranding;
        const f = brandingToForm(branding);
        if (!cancelled) {
          setForm(f);
          setInitial(f);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load branding');
          setLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [communityId]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleChange(field: keyof BrandingForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSuccess(false);
  }

  function handlePresetClick(presetId: string) {
    const preset = THEME_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const b = presetToBranding(preset);
    setForm((prev) => ({
      ...prev,
      primaryColor: b.primaryColor,
      secondaryColor: b.secondaryColor,
      accentColor: b.accentColor,
      fontHeading: b.fontHeading,
      fontBody: b.fontBody,
    }));
    setSuccess(false);
  }

  const handleLogoSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_LOGO_SIZE) {
      setError('Logo must be under 5 MB');
      return;
    }

    // Magic byte validation
    const buf = new Uint8Array(await file.arrayBuffer());
    const mime = detectImageMime(buf);
    if (!mime) {
      setError('Invalid file type. Use PNG, JPEG, or WebP.');
      return;
    }

    // Show local preview
    if (logoObjectUrlRef.current) URL.revokeObjectURL(logoObjectUrlRef.current);
    const objUrl = URL.createObjectURL(file);
    logoObjectUrlRef.current = objUrl;
    setLogoPreviewUrl(objUrl);
    setError('');

    // Upload via admin upload route
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('communityId', String(communityId));

      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(typeof errData.error === 'string' ? errData.error : 'Upload failed');
      }

      const { data } = await res.json();
      setForm((prev) => ({ ...prev, logoPath: data.path }));
      setLogoPublicUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [communityId]);

  function handleRemoveLogo() {
    if (logoObjectUrlRef.current) {
      URL.revokeObjectURL(logoObjectUrlRef.current);
      logoObjectUrlRef.current = null;
    }
    setLogoPreviewUrl(null);
    setLogoPublicUrl(null);
    setForm((prev) => ({ ...prev, logoPath: '' }));
    setSuccess(false);
  }

  function handleReset() {
    setForm(initial);
    handleRemoveLogo();
    setError('');
    setSuccess(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(false);

    try {
      const body: Record<string, string> = {};
      if (form.primaryColor !== initial.primaryColor) body.primaryColor = form.primaryColor;
      if (form.secondaryColor !== initial.secondaryColor) body.secondaryColor = form.secondaryColor;
      if (form.accentColor !== initial.accentColor) body.accentColor = form.accentColor;
      if (form.fontHeading !== initial.fontHeading) body.fontHeading = form.fontHeading;
      if (form.fontBody !== initial.fontBody) body.fontBody = form.fontBody;
      if (form.logoPath !== initial.logoPath) body.logoStoragePath = form.logoPath;

      // Nothing changed
      if (Object.keys(body).length === 0) {
        setSuccess(true);
        return;
      }

      const res = await fetch(`/api/admin/communities/${communityId}/branding`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? 'Failed to save');
        return;
      }

      const f = brandingToForm(data.branding as CommunityBranding);
      setForm(f);
      setInitial(f);
      setSuccess(true);
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const currentLogoSrc = logoPreviewUrl ?? logoPublicUrl ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500">Loading branding...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Theme Presets */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-e1">
        <h2 className="mb-1 text-sm font-semibold text-gray-700">Theme Presets</h2>
        <p className="mb-4 text-xs text-gray-400">Quick-start with a curated palette, then customize.</p>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {THEME_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handlePresetClick(preset.id)}
              className="group rounded-md border border-gray-200 p-2.5 text-left transition-colors hover:border-blue-400 hover:bg-blue-50/40"
            >
              <div className="mb-1.5 flex gap-1">
                <div className="h-4 w-4 rounded" style={{ backgroundColor: preset.primaryColor }} />
                <div className="h-4 w-4 rounded" style={{ backgroundColor: preset.secondaryColor }} />
                <div className="h-4 w-4 rounded" style={{ backgroundColor: preset.accentColor }} />
              </div>
              <p className="text-xs font-medium text-gray-700">{preset.name}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Form + Preview side-by-side */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Form */}
        <div className="space-y-6">
          {/* Colors */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-e1">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">Brand Colors</h2>
            <div className="space-y-4">
              {([
                ['primaryColor', 'Primary'] as const,
                ['secondaryColor', 'Secondary'] as const,
                ['accentColor', 'Accent'] as const,
              ]).map(([key, label]) => (
                <div key={key} className="flex items-center gap-3">
                  <input
                    type="color"
                    value={form[key]}
                    onChange={(e) => handleChange(key, e.target.value)}
                    className="h-9 w-9 cursor-pointer rounded border border-gray-200 p-0.5"
                  />
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                    <input
                      type="text"
                      value={form[key]}
                      onChange={(e) => handleChange(key, e.target.value)}
                      pattern="^#[0-9a-fA-F]{6}$"
                      maxLength={7}
                      className="w-full rounded-md border border-gray-300 px-3 py-1.5 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Fonts */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-e1">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">Typography</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {([
                ['fontHeading', 'Heading Font'] as const,
                ['fontBody', 'Body Font'] as const,
              ]).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                  <select
                    value={form[key]}
                    onChange={(e) => handleChange(key, e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {ALLOWED_FONTS.map((font) => (
                      <option key={font} value={font}>{font}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Logo */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-e1">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">Logo</h2>
            {currentLogoSrc ? (
              <div className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={currentLogoSrc} alt="Logo" className="h-16 w-16 rounded-lg border border-gray-200 object-cover" />
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-gray-500">
                    {uploading ? 'Uploading...' : 'Logo uploaded'}
                  </p>
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                  >
                    <X size={12} /> Remove
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 p-6 transition-colors hover:border-blue-400 hover:bg-blue-50/30">
                <Upload size={20} className="text-gray-400" />
                <span className="text-xs text-gray-500">
                  PNG, JPEG, or WebP &middot; max 5 MB
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleLogoSelect}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>

        {/* Right: Live Preview */}
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
              Landing Page Preview
            </p>

            {/* Miniature landing page mockup */}
            <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-e1">
              {/* Header */}
              <div
                className="flex items-center gap-2 px-4 py-3"
                style={{ backgroundColor: form.primaryColor }}
              >
                {currentLogoSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={currentLogoSrc} alt="Logo preview" className="h-7 w-7 rounded object-cover" />
                ) : (
                  <div className="h-7 w-7 rounded bg-white/30" />
                )}
                <span
                  className="text-sm font-semibold text-white"
                  style={{ fontFamily: form.fontHeading }}
                >
                  {communitySlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </span>
                <span className="ml-auto rounded bg-white/20 px-2 py-0.5 text-xs text-white">Login</span>
              </div>

              {/* Hero section */}
              <div
                className="px-4 py-6"
                style={{ backgroundColor: form.accentColor }}
              >
                <p
                  className="text-lg font-bold"
                  style={{ fontFamily: form.fontHeading, color: form.primaryColor }}
                >
                  Welcome to your community
                </p>
                <p
                  className="mt-1 text-xs"
                  style={{ fontFamily: form.fontBody, color: form.secondaryColor }}
                >
                  Access documents, meetings, and announcements.
                </p>
                <button
                  type="button"
                  className="mt-3 rounded px-3 py-1.5 text-xs font-medium text-white"
                  style={{ backgroundColor: form.primaryColor }}
                >
                  Resident Portal
                </button>
              </div>

              {/* Feature cards */}
              <div className="grid grid-cols-3 gap-2 p-4">
                {['Documents', 'Meetings', 'Notices'].map((label) => (
                  <div key={label} className="rounded border border-gray-100 p-2 text-center">
                    <div
                      className="mx-auto mb-1 h-6 w-6 rounded"
                      style={{ backgroundColor: form.accentColor }}
                    />
                    <p
                      className="text-xs font-medium"
                      style={{ fontFamily: form.fontBody, color: form.secondaryColor }}
                    >
                      {label}
                    </p>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div
                className="border-t border-gray-100 px-4 py-2 text-center"
                style={{ backgroundColor: darkenHex(form.primaryColor, 70), color: '#ffffff' }}
              >
                <p className="text-xs opacity-70" style={{ fontFamily: form.fontBody }}>
                  Powered by PropertyPro
                </p>
              </div>
            </div>

            {/* Color swatches */}
            <div className="mt-3 flex flex-wrap gap-3">
              {[
                [form.primaryColor, 'Primary'],
                [form.secondaryColor, 'Secondary'],
                [form.accentColor, 'Accent'],
              ].map(([color, label]) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className="h-4 w-4 rounded border border-gray-200" style={{ backgroundColor: color }} />
                  <span className="text-xs text-gray-600">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Public URL info */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-e1">
            <p className="text-xs font-medium text-gray-500">Public URL</p>
            <p className="mt-1 font-mono text-sm text-gray-700">
              {communitySlug}.propertyprofl.com
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || uploading}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save Branding
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RotateCcw size={14} />
          Reset
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">Branding saved</p>}
      </div>
    </form>
  );
}
