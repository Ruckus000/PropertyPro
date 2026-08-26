import React from 'react';

/**
 * The PropertyPro wordmark. Shared by the nav and the footer so the two can
 * never drift; the footer recolours the accent bar via
 * `.mk-footer .mk-logo .mk-logomark-a` rather than taking a prop.
 */
export function Logomark() {
  return (
    <svg className="mk-logomark" viewBox="0 0 32 32" aria-hidden="true">
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
      <rect x="10" y="23.1" width="6" height="2.3" rx="1.15" className="mk-logomark-a" />
    </svg>
  );
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
