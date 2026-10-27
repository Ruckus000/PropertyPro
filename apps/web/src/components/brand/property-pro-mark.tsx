/**
 * The PropertyPro house mark: a roof line over a house outline holding two
 * bars, the shorter one an accent. It is the single source for the mark in the
 * app, the marketing site (`components/marketing/marketing-brand.tsx`) and the
 * favicons (`apps/web/public/brand/icon.svg` and `apps/admin/src/app/icon.svg`
 * draw the same paths; keep them in step with this file, then re-run
 * `scripts/generate-web-icons.mjs` and `scripts/generate-admin-icons.mjs`).
 *
 * This module imports nothing on purpose. The marketing page renders the mark,
 * and importing `cn` here pulled tailwind-merge into that bundle (+92 KiB,
 * failing perf-check's aggregate budget), so classes are joined by hand.
 *
 * Every stroke and the long bar paint in `currentColor`. The accent bar paints
 * in `currentColor` too unless `accentClassName` recolours it; a CSS `fill`
 * beats the presentation attribute, which is how the marketing nav and footer
 * tint it.
 */
export function PropertyProMark({
  className,
  accentClassName,
}: {
  className?: string;
  accentClassName?: string;
}) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path
        d="M4 11.8L16 4.4l12 7.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.6 14.9V25.6a2.6 2.6 0 0 0 2.6 2.6h13.6a2.6 2.6 0 0 0 2.6-2.6V14.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <rect x="10" y="18.5" width="12" height="2.3" rx="1.15" fill="currentColor" />
      <rect
        x="10"
        y="23.1"
        width="6"
        height="2.3"
        rx="1.15"
        fill="currentColor"
        className={accentClassName}
      />
    </svg>
  );
}

/**
 * The house mark in white on the coral brand tile, as the app chrome shows it
 * (sidebar, website editor, Help Center, signup). The accent bar is the same
 * white at reduced opacity so it still reads as the accent on coral.
 */
export function PropertyProTile({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-md bg-interactive text-content-inverse ${
        size === 'sm' ? 'size-8' : 'size-9'
      }`}
    >
      <PropertyProMark
        className={size === 'sm' ? 'size-5' : 'size-6'}
        accentClassName="opacity-70"
      />
    </span>
  );
}
