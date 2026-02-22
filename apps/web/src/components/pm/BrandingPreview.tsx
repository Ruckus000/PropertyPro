'use client';

/**
 * P3-47: Read-only branding preview panel.
 *
 * Shows a miniature portal mockup with the candidate logo and brand colors
 * applied via CSS custom properties. No API calls — purely presentational.
 */
import type { CommunityBranding } from '@propertypro/shared';

interface BrandingPreviewProps {
  branding: CommunityBranding;
  /** Object URL for a locally-selected logo file (before upload) */
  logoObjectUrl?: string;
}

export function BrandingPreview({ branding, logoObjectUrl }: BrandingPreviewProps) {
  const primary = branding.primaryColor ?? '#1a56db';
  const secondary = branding.secondaryColor ?? '#6b7280';
  const logoSrc = logoObjectUrl ?? null;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
        Portal Preview
      </p>

      {/* Miniature portal mockup */}
      <div
        className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-e1"
        style={{ '--brand-primary': primary, '--brand-secondary': secondary } as React.CSSProperties}
      >
        {/* Mock header */}
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{ backgroundColor: primary }}
        >
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoSrc} alt="Logo preview" className="h-6 w-6 rounded object-cover" />
          ) : (
            <div className="h-6 w-6 rounded bg-white/30" />
          )}
          <span className="text-xs font-semibold text-white">Community Portal</span>
        </div>

        {/* Mock nav */}
        <div className="flex gap-1 border-b border-gray-100 px-3 py-1.5">
          {['Home', 'Documents', 'Meetings'].map((label) => (
            <span
              key={label}
              className="rounded px-2 py-0.5 text-xs"
              style={{ color: primary }}
            >
              {label}
            </span>
          ))}
        </div>

        {/* Mock content */}
        <div className="space-y-1.5 p-3">
          {[80, 60, 90].map((w, i) => (
            <div
              key={i}
              className="h-2 rounded"
              style={{ width: `${w}%`, backgroundColor: secondary, opacity: 0.3 }}
            />
          ))}
        </div>
      </div>

      {/* Color swatches */}
      <div className="mt-3 flex gap-3">
        <div className="flex items-center gap-1.5">
          <div
            className="h-4 w-4 rounded border border-gray-200"
            style={{ backgroundColor: primary }}
          />
          <span className="text-xs text-gray-600">Primary</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="h-4 w-4 rounded border border-gray-200"
            style={{ backgroundColor: secondary }}
          />
          <span className="text-xs text-gray-600">Secondary</span>
        </div>
      </div>
    </div>
  );
}
