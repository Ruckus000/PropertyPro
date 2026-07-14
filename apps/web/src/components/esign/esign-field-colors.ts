/**
 * ESIGN_FIELD_COLORS — the single source for the signer/field annotation
 * colors painted onto PDF field overlays and signer role chips in the e-sign
 * template builder and detail views.
 *
 * These are rendered directly into PDF-coordinate overlays (field borders,
 * fills, and signer swatches positioned in percentage-of-page space), so
 * they are literal hex by design, not design-system tokens — each entry
 * carries its own design-tokens:exempt marker for scripts/verify-design-tokens.ts.
 *
 * Consumers (template-builder-client.tsx, template-detail-client.tsx) index
 * into this array by signer-role order, cycling with `% ESIGN_FIELD_COLORS.length`.
 */
export const ESIGN_FIELD_COLORS = [
  '#2563eb', // blue — design-tokens:exempt — PDF field-overlay palette (single source)
  '#dc2626', // red — design-tokens:exempt — PDF field-overlay palette (single source)
  '#16a34a', // green — design-tokens:exempt — PDF field-overlay palette (single source)
  '#9333ea', // purple — design-tokens:exempt — PDF field-overlay palette (single source)
  '#ea580c', // orange — design-tokens:exempt — PDF field-overlay palette (single source)
  '#0891b2', // cyan — design-tokens:exempt — PDF field-overlay palette (single source)
  '#be185d', // pink — design-tokens:exempt — PDF field-overlay palette (single source)
  '#854d0e', // amber — design-tokens:exempt — PDF field-overlay palette (single source)
] as const;

export type EsignFieldColor = (typeof ESIGN_FIELD_COLORS)[number];
