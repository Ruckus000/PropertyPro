import { tokenDefinitions as t, toHex } from './semantic';

// Re-export primitives so email templates can reference one-off colors
// without needing a semantic token for every shade.
export { primitiveColors } from './primitives';

/**
 * Resolved color values for email inline styles.
 * Email clients don't support CSS custom properties.
 *
 * For theme-aware tokens (interactive.primary, status.brand),
 * these resolve to the DEFAULT fallback hex. Runtime per-community
 * branding overrides are handled by email-layout.tsx via
 * branding.accentColor.
 */
export const emailColors = {
  // Text
  textPrimary:     toHex(t.text.primary),        // #111827
  textSecondary:   toHex(t.text.secondary),       // #4B5563
  textTertiary:    toHex(t.text.tertiary),         // #4B5563
  textDisabled:    toHex(t.text.disabled),         // #9CA3AF
  textInverse:     toHex(t.text.inverse),          // #FFFFFF
  textBrand:       toHex(t.text.brand),            // #2563EB
  textLink:        toHex(t.text.link),             // #2563EB

  // Surfaces
  surfacePage:     toHex(t.surface.page),          // #F9FAFB
  surfaceCard:     toHex(t.surface.card),          // #FFFFFF
  surfaceMuted:    toHex(t.surface.muted),         // #F3F4F6

  // Borders
  borderDefault:   toHex(t.border.default),        // #E5E7EB
  borderStrong:    toHex(t.border.strong),         // #D1D5DB

  // Interactive (default fallback — overridden by branding.accentColor at runtime)
  interactivePrimary:      toHex(t.interactive.primary),      // #2563EB
  interactivePrimaryHover: toHex(t.interactive.primaryHover), // #1D4ED8

  // Status — success
  successForeground: toHex(t.status.success.foreground), // #047857
  successBackground: toHex(t.status.success.background), // #ECFDF5
  successBorder:     toHex(t.status.success.border),     // #A7F3D0
  successSubtle:     toHex(t.status.success.subtle),     // #D1FAE5

  // Status — warning
  warningForeground: toHex(t.status.warning.foreground), // #B45309
  warningBackground: toHex(t.status.warning.background), // #FFFBEB
  warningBorder:     toHex(t.status.warning.border),     // #FDE68A
  warningSubtle:     toHex(t.status.warning.subtle),     // #FEF3C7

  // Status — danger
  dangerForeground: toHex(t.status.danger.foreground),   // #B91C1C
  dangerBackground: toHex(t.status.danger.background),   // #FEF2F2
  dangerBorder:     toHex(t.status.danger.border),       // #FECACA
  dangerSubtle:     toHex(t.status.danger.subtle),       // #FEE2E2

  // Status — info
  infoForeground: toHex(t.status.info.foreground),       // #1D4ED8
  infoBackground: toHex(t.status.info.background),       // #EFF6FF
  infoBorder:     toHex(t.status.info.border),           // #BFDBFE
  infoSubtle:     toHex(t.status.info.subtle),           // #DBEAFE

  // Status — neutral
  neutralForeground: toHex(t.status.neutral.foreground), // #4B5563
  neutralBackground: toHex(t.status.neutral.background), // #F3F4F6
  neutralBorder:     toHex(t.status.neutral.border),     // #E5E7EB
  neutralSubtle:     toHex(t.status.neutral.subtle),     // #F9FAFB
} as const;
