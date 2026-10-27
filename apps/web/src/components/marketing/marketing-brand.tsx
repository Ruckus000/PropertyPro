import React from 'react';
import { PropertyProMark } from '@/components/brand/property-pro-mark';

/**
 * The PropertyPro house mark as the marketing nav and footer draw it. The paths
 * live in `components/brand/property-pro-mark.tsx`, shared with the app chrome
 * and the favicons; the footer recolours the accent bar via
 * `.mk-footer .mk-logo .mk-logomark-a` rather than taking a prop.
 */
export function Logomark() {
  return <PropertyProMark className="mk-logomark" accentClassName="mk-logomark-a" />;
}

/** `07 —— PRICING` section marker. `index` is the ordinal or a statute cite. */
export function SectionMark({ index, label }: { index: string; label: string }) {
  return (
    <p className="mk-mark">
      <span className="mk-ix">{index}</span>
      <span className="mk-er" aria-hidden="true" />
      <span className="mk-lb">{label}</span>
    </p>
  );
}

export function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      aria-hidden="true"
    >
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

/** Status glyphs for `.mk-pin`. Decorative — the pin always carries text too. */
export function PinOkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function PinBadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6M9 9l6 6" />
    </svg>
  );
}

export function PinWarnIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

/**
 * Fake browser chrome for the product surfaces. The three dots are coloured by
 * `:nth-child` in marketing-theme.css rather than inline styles, so the guard
 * never sees a raw hex in a component.
 */
export function SurfaceBar({ url }: { url: string }) {
  return (
    <div className="mk-sbar">
      <i />
      <i />
      <i />
      <span className="mk-surl">{url}</span>
    </div>
  );
}
