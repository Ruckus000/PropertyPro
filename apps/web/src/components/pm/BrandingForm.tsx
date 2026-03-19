'use client';

/**
 * P3-47: White-label branding settings form for property managers.
 *
 * Upload flow:
 *  1. User selects a logo file → local object URL shown in BrandingPreview
 *  2. On submit: POST /api/v1/upload (presigned URL) → PUT to Supabase Storage
 *  3. PATCH /api/v1/pm/branding with the storage path + colors + fonts
 */
import { useState, useRef, useEffect } from 'react';
import type { CommunityBranding } from '@propertypro/shared';
import { ALLOWED_FONTS } from '@propertypro/theme';
import { BrandingPreview } from './BrandingPreview';

const MAX_LOGO_BYTES = 10 * 1024 * 1024; // 10 MB

// Magic byte signatures for allowed image types
const MAGIC_BYTES: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/webp', bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 },
];

function readFileHeader(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(new Uint8Array(reader.result as ArrayBuffer));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file.slice(0, 12));
  });
}

async function detectImageMimeFromMagicBytes(file: File): Promise<string | null> {
  const bytes = await readFileHeader(file);
  for (const sig of MAGIC_BYTES) {
    const start = sig.offset ?? 0;
    const matches = sig.bytes.every((b, i) => bytes[start + i] === b);
    if (matches) return sig.mime;
  }
  return null;
}

interface PresignResponse {
  data: { path: string; uploadUrl: string };
}

interface BrandingFormProps {
  communityId: number;
  initialBranding: CommunityBranding;
}

export function BrandingForm({ communityId, initialBranding }: BrandingFormProps) {
  const [primaryColor, setPrimaryColor] = useState(initialBranding.primaryColor ?? '#2563eb');
  const [secondaryColor, setSecondaryColor] = useState(initialBranding.secondaryColor ?? '#6b7280');
  const [accentColor, setAccentColor] = useState(initialBranding.accentColor ?? '#DBEAFE');
  const [fontHeading, setFontHeading] = useState(initialBranding.fontHeading ?? 'Inter');
  const [fontBody, setFontBody] = useState(initialBranding.fontBody ?? 'Inter');
  const [customEmailFooter, setCustomEmailFooter] = useState(initialBranding.customEmailFooter ?? '');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoObjectUrl, setLogoObjectUrl] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const objectUrlRef = useRef<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke previous object URL on unmount or file change
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setError(null);

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = undefined;
    }

    if (!file) {
      setLogoFile(null);
      setLogoObjectUrl(undefined);
      return;
    }

    if (file.size > MAX_LOGO_BYTES) {
      setError('Logo must be 10 MB or smaller.');
      return;
    }

    // Validate via magic bytes — do not trust file.type (Content-Type header)
    const detectedMime = await detectImageMimeFromMagicBytes(file);
    if (!detectedMime) {
      setError('Logo must be a PNG, JPEG, or WebP image.');
      return;
    }

    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setLogoFile(file);
    setLogoObjectUrl(url);
  }

  async function uploadLogo(file: File): Promise<string> {
    const presignRes = await fetch('/api/v1/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        communityId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      }),
    });

    if (!presignRes.ok) {
      throw new Error('Failed to prepare logo upload');
    }

    const { data } = (await presignRes.json()) as PresignResponse;

    const uploadRes = await fetch(data.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': file.type },
      body: file,
    });

    if (!uploadRes.ok) {
      throw new Error('Failed to upload logo');
    }

    return data.path;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setIsSubmitting(true);

    try {
      let logoStoragePath: string | undefined;
      if (logoFile) {
        logoStoragePath = await uploadLogo(logoFile);
      }

      const res = await fetch('/api/v1/pm/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId,
          primaryColor,
          secondaryColor,
          accentColor,
          fontHeading,
          fontBody,
          customEmailFooter: customEmailFooter || undefined,
          ...(logoStoragePath !== undefined && { logoStoragePath }),
        }),
      });

      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } };
        throw new Error(json.error?.message ?? 'Failed to save branding');
      }

      setSuccess(true);
      setLogoFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  }

  const previewBranding: CommunityBranding = {
    primaryColor,
    secondaryColor,
    accentColor,
    fontHeading,
    fontBody,
    logoPath: initialBranding.logoPath,
  };

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Logo */}
        <div>
          <label htmlFor="logo-upload" className="mb-1.5 block text-sm font-medium text-gray-700">
            Company Logo
          </label>
          <p className="mb-2 text-xs text-gray-500">
            PNG, JPEG, or WebP · max 10 MB · will be resized to 400×400 WebP
          </p>
          <input
            id="logo-upload"
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            onChange={handleLogoChange}
            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>

        {/* Primary color */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Primary Brand Color
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-9 w-16 cursor-pointer rounded border border-gray-300 p-0.5"
            />
            <input
              type="text"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              pattern="^#[0-9a-fA-F]{6}$"
              maxLength={7}
              className="w-28 rounded border border-gray-300 px-2 py-1.5 font-mono text-sm"
            />
          </div>
        </div>

        {/* Secondary color */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Secondary Brand Color
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={secondaryColor}
              onChange={(e) => setSecondaryColor(e.target.value)}
              className="h-9 w-16 cursor-pointer rounded border border-gray-300 p-0.5"
            />
            <input
              type="text"
              value={secondaryColor}
              onChange={(e) => setSecondaryColor(e.target.value)}
              pattern="^#[0-9a-fA-F]{6}$"
              maxLength={7}
              className="w-28 rounded border border-gray-300 px-2 py-1.5 font-mono text-sm"
            />
          </div>
        </div>

        {/* Accent color */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Accent Color
          </label>
          <p className="mb-1.5 text-xs text-gray-500">Used for badges and highlighted backgrounds</p>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="h-9 w-16 cursor-pointer rounded border border-gray-300 p-0.5"
            />
            <input
              type="text"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              pattern="^#[0-9a-fA-F]{6}$"
              maxLength={7}
              className="w-28 rounded border border-gray-300 px-2 py-1.5 font-mono text-sm"
            />
          </div>
        </div>

        {/* Font heading */}
        <div>
          <label htmlFor="font-heading" className="mb-1.5 block text-sm font-medium text-gray-700">
            Heading Font
          </label>
          <select
            id="font-heading"
            value={fontHeading}
            onChange={(e) => setFontHeading(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            {ALLOWED_FONTS.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
        </div>

        {/* Font body */}
        <div>
          <label htmlFor="font-body" className="mb-1.5 block text-sm font-medium text-gray-700">
            Body Font
          </label>
          <select
            id="font-body"
            value={fontBody}
            onChange={(e) => setFontBody(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            {ALLOWED_FONTS.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
        </div>

        {/* Custom email footer */}
        <div>
          <label htmlFor="custom-email-footer" className="mb-1.5 block text-sm font-medium text-gray-700">
            Custom Email Footer
          </label>
          <p className="mb-1.5 text-xs text-gray-500">
            Optional text appended to all outbound emails for this community
          </p>
          <textarea
            id="custom-email-footer"
            value={customEmailFooter}
            onChange={(e) => setCustomEmailFooter(e.target.value)}
            rows={3}
            maxLength={500}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            placeholder="e.g. Questions? Contact management at (305) 555-0100"
          />
        </div>

        {/* Feedback */}
        {error && (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            Branding saved successfully.
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Saving…' : 'Save Branding'}
        </button>
      </form>

      {/* Live preview */}
      <BrandingPreview branding={previewBranding} logoObjectUrl={logoObjectUrl} />
    </div>
  );
}
