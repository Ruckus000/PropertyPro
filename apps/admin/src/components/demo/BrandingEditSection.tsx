'use client';

/**
 * Branding editor section for the demo edit drawer.
 *
 * Adapted from CommunityWebsiteEditor — same color pickers, font dropdowns,
 * and logo upload pattern, but without the inline preview (the iframe IS the
 * live preview). Saves via demo-scoped branding API.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Save, RotateCcw, Upload, X } from 'lucide-react';
import type { CommunityBranding } from '@propertypro/shared';
import { ALLOWED_FONTS, THEME_DEFAULTS, THEME_PRESETS, presetToBranding } from '@propertypro/theme';

// ---------------------------------------------------------------------------
// Magic-byte validation (matches admin upload route)
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

interface BrandingEditSectionProps {
  demoId: number;
  communityId: number;
  onSaved: () => void;
}

interface BrandingForm {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontHeading: string;
  fontBody: string;
  logoPath: string;
}

const MAX_LOGO_SIZE = 5 * 1024 * 1024;

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

export function BrandingEditSection({ demoId, communityId, onSaved }: BrandingEditSectionProps) {
  const [form, setForm] = useState<BrandingForm>(brandingToForm({}));
  const [initial, setInitial] = useState<BrandingForm>(brandingToForm({}));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const logoObjectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (logoObjectUrlRef.current) URL.revokeObjectURL(logoObjectUrlRef.current);
    };
  }, []);

  // Fetch current branding
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/admin/demos/${demoId}/community/branding`);
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
  }, [demoId]);

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

    const buf = new Uint8Array(await file.arrayBuffer());
    const mime = detectImageMime(buf);
    if (!mime) {
      setError('Invalid file type. Use PNG, JPEG, or WebP.');
      return;
    }

    if (logoObjectUrlRef.current) URL.revokeObjectURL(logoObjectUrlRef.current);
    const objUrl = URL.createObjectURL(file);
    logoObjectUrlRef.current = objUrl;
    setLogoPreviewUrl(objUrl);
    setError('');

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

      if (Object.keys(body).length === 0) {
        setSuccess(true);
        return;
      }

      const res = await fetch(`/api/admin/demos/${demoId}/community/branding`, {
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
      onSaved();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  const currentLogoSrc = logoPreviewUrl ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={16} className="animate-spin text-gray-400" />
        <span className="ml-2 text-xs text-gray-500">Loading branding...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      {/* Theme Presets */}
      <div>
        <p className="mb-2 text-xs font-medium text-gray-500">Quick Presets</p>
        <div className="grid grid-cols-3 gap-1.5">
          {THEME_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handlePresetClick(preset.id)}
              className="group rounded border border-gray-200 p-2 text-left transition-colors hover:border-blue-400 hover:bg-blue-50/40"
            >
              <div className="mb-1 flex gap-0.5">
                <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: preset.primaryColor }} />
                <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: preset.secondaryColor }} />
                <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: preset.accentColor }} />
              </div>
              <p className="truncate text-xs text-gray-600">{preset.name}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Colors */}
      <div>
        <p className="mb-2 text-xs font-medium text-gray-500">Brand Colors</p>
        <div className="space-y-3">
          {([
            ['primaryColor', 'Primary'] as const,
            ['secondaryColor', 'Secondary'] as const,
            ['accentColor', 'Accent'] as const,
          ]).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2">
              <input
                type="color"
                value={form[key]}
                onChange={(e) => handleChange(key, e.target.value)}
                className="h-8 w-8 cursor-pointer rounded border border-gray-200 p-0.5"
              />
              <div className="flex-1">
                <label className="block text-xs text-gray-500">{label}</label>
                <input
                  type="text"
                  value={form[key]}
                  onChange={(e) => handleChange(key, e.target.value)}
                  pattern="^#[0-9a-fA-F]{6}$"
                  maxLength={7}
                  className="w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Fonts */}
      <div>
        <p className="mb-2 text-xs font-medium text-gray-500">Typography</p>
        <div className="space-y-3">
          {([
            ['fontHeading', 'Heading Font'] as const,
            ['fontBody', 'Body Font'] as const,
          ]).map(([key, label]) => (
            <div key={key}>
              <label className="block text-xs text-gray-500 mb-1">{label}</label>
              <select
                value={form[key]}
                onChange={(e) => handleChange(key, e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
      <div>
        <p className="mb-2 text-xs font-medium text-gray-500">Logo</p>
        {currentLogoSrc || form.logoPath ? (
          <div className="flex items-center gap-3">
            {currentLogoSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentLogoSrc} alt="Logo" className="h-12 w-12 rounded border border-gray-200 object-cover" />
            )}
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
          <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed border-gray-300 p-4 transition-colors hover:border-blue-400 hover:bg-blue-50/30">
            <Upload size={16} className="text-gray-400" />
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

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <button
          type="submit"
          disabled={saving || uploading}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Save
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          <RotateCcw size={12} />
          Reset
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {success && <p className="text-xs text-green-600">Saved</p>}
      </div>
    </form>
  );
}
