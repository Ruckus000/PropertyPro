'use client';

/**
 * Controlled branding form fields — no API calls, parent owns state.
 *
 * Used by BrandingEditSection (demo edit drawer) and by the new demo creation
 * wizard (where no demoId exists yet). When communityId is omitted the logo is
 * stored as a local blob URL; the actual upload happens after the demo is created.
 */
import { useRef, useCallback, useEffect } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { ALLOWED_FONTS, THEME_PRESETS, presetToBranding } from '@propertypro/theme';

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

const MAX_LOGO_SIZE = 5 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BrandingValues {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontHeading: string;
  fontBody: string;
  logoPath: string;
}

interface BrandingFormFieldsProps {
  value: BrandingValues;
  onChange: (values: BrandingValues) => void;
  /** Needed for logo upload endpoint. If omitted, blob URL is used until demo is created. */
  communityId?: number;
  /** Lifted error setter so upload errors surface in the parent's error state. */
  onError?: (message: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BrandingFormFields({
  value,
  onChange,
  communityId,
  onError,
}: BrandingFormFieldsProps) {
  const logoObjectUrlRef = useRef<string | null>(null);

  // Revoke object URL on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (logoObjectUrlRef.current) {
        URL.revokeObjectURL(logoObjectUrlRef.current);
      }
    };
  }, []);

  // Derive the preview URL: if logoPath is a blob URL (wizard case) use it directly.
  const logoPreviewUrl = value.logoPath.startsWith('blob:') ? value.logoPath : null;
  const hasLogo = Boolean(logoPreviewUrl ?? value.logoPath);

  function setError(msg: string) {
    onError?.(msg);
  }

  function handleFieldChange(field: keyof BrandingValues, val: string) {
    onChange({ ...value, [field]: val });
  }

  function handlePresetClick(presetId: string) {
    const preset = THEME_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const b = presetToBranding(preset);
    onChange({
      ...value,
      primaryColor: b.primaryColor,
      secondaryColor: b.secondaryColor,
      accentColor: b.accentColor,
      fontHeading: b.fontHeading,
      fontBody: b.fontBody,
    });
  }

  const handleLogoSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
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

      // Revoke previous object URL if any
      if (logoObjectUrlRef.current) URL.revokeObjectURL(logoObjectUrlRef.current);

      if (communityId !== undefined) {
        // Upload immediately when we have a community
        const objUrl = URL.createObjectURL(file);
        logoObjectUrlRef.current = objUrl;

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
          // Revoke the temporary object URL now that we have a real path
          URL.revokeObjectURL(objUrl);
          logoObjectUrlRef.current = null;
          onChange({ ...value, logoPath: data.path });
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Upload failed');
        }
      } else {
        // Wizard case: store as blob URL, upload happens after demo creation
        const blobUrl = URL.createObjectURL(file);
        logoObjectUrlRef.current = blobUrl;
        onChange({ ...value, logoPath: blobUrl });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [communityId, value, onChange],
  );

  function handleRemoveLogo() {
    if (logoObjectUrlRef.current) {
      URL.revokeObjectURL(logoObjectUrlRef.current);
      logoObjectUrlRef.current = null;
    }
    onChange({ ...value, logoPath: '' });
  }

  return (
    <div className="space-y-4">
      {/* Theme Presets */}
      <div>
        <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">Quick Presets</p>
        <div className="grid grid-cols-3 gap-1.5">
          {THEME_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handlePresetClick(preset.id)}
              className="group rounded border border-[var(--border-default)] p-2 text-left transition-colors hover:border-[var(--interactive-primary)] hover:bg-[var(--interactive-subtle)]"
            >
              <div className="mb-1 flex gap-0.5">
                <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: preset.primaryColor }} />
                <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: preset.secondaryColor }} />
                <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: preset.accentColor }} />
              </div>
              <p className="truncate text-xs text-[var(--text-secondary)]">{preset.name}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Colors */}
      <div>
        <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">Brand Colors</p>
        <div className="space-y-3">
          {([
            ['primaryColor', 'Primary'] as const,
            ['secondaryColor', 'Secondary'] as const,
            ['accentColor', 'Accent'] as const,
          ]).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2">
              <input
                type="color"
                value={value[key]}
                onChange={(e) => handleFieldChange(key, e.target.value)}
                className="h-8 w-8 cursor-pointer rounded border border-[var(--border-default)] p-0.5"
              />
              <div className="flex-1">
                <label className="block text-xs text-[var(--text-secondary)]">{label}</label>
                <input
                  type="text"
                  value={value[key]}
                  onChange={(e) => handleFieldChange(key, e.target.value)}
                  pattern="^#[0-9a-fA-F]{6}$"
                  maxLength={7}
                  className="w-full rounded border border-[var(--border-strong)] px-2 py-1 font-mono text-xs focus:border-[var(--interactive-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--interactive-primary)]"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Fonts */}
      <div>
        <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">Typography</p>
        <div className="space-y-3">
          {([
            ['fontHeading', 'Heading Font'] as const,
            ['fontBody', 'Body Font'] as const,
          ]).map(([key, label]) => (
            <div key={key}>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">{label}</label>
              <select
                value={value[key]}
                onChange={(e) => handleFieldChange(key, e.target.value)}
                className="w-full rounded border border-[var(--border-strong)] px-2 py-1.5 text-xs focus:border-[var(--interactive-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--interactive-primary)]"
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
        <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">Logo</p>
        {hasLogo ? (
          <div className="flex items-center gap-3">
            {logoPreviewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoPreviewUrl}
                alt="Logo"
                className="h-12 w-12 rounded border border-[var(--border-default)] object-cover"
              />
            )}
            <div className="flex flex-col gap-1">
              <p className="text-xs text-[var(--text-secondary)]">
                {communityId !== undefined && value.logoPath.startsWith('blob:')
                  ? <><Loader2 size={10} className="inline animate-spin mr-1" />Uploading...</>
                  : 'Logo uploaded'}
              </p>
              <button
                type="button"
                onClick={handleRemoveLogo}
                className="inline-flex items-center gap-1 text-xs text-[var(--status-danger)] hover:opacity-80"
              >
                <X size={12} /> Remove
              </button>
            </div>
          </div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed border-[var(--border-strong)] p-4 transition-colors hover:border-[var(--interactive-primary)] hover:bg-[var(--interactive-subtle)]">
            <Upload size={16} className="text-[var(--text-disabled)]" />
            <span className="text-xs text-[var(--text-secondary)]">
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
  );
}
