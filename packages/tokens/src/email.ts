import { tokenDefinitions as t, toHex } from './semantic';
import { primitiveColors } from './primitives';

// Re-export primitives so email templates can reference one-off colors
// without needing a semantic token for every shade.
export { primitiveColors };

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
  // ── Legacy tokens (v1) — kept for backwards compat / tests ────────────
  // Prefer the v2 zinc-based tokens below for new code.

  // Text
  textPrimary:     toHex(t.text.primary),        // #111827
  textSecondary:   toHex(t.text.secondary),       // #4B5563
  textTertiary:    toHex(t.text.tertiary),         // #4B5563
  textDisabled:    toHex(t.text.disabled),         // #9CA3AF
  textInverse:     toHex(t.text.inverse),          // #FFFFFF
  // Brand text pinned to the cool `blue` ramp. The app rebranded text.brand/
  // link to "Florida Modern" coral for landing-consistency, but transactional
  // emails stay on the prior blue (out of that scope — same reasoning as the
  // Surfaces/Borders notes above).
  textBrand:       primitiveColors.blue[600],      // #2563EB
  textLink:        primitiveColors.blue[600],      // #2563EB

  // Surfaces — pinned to the cool `gray` ramp. The app's surface.* tokens
  // warmed to the `sand` ramp for landing-consistency, but transactional
  // emails stay neutral-cool (out of that scope), so these intentionally do
  // NOT follow surface.* anymore.
  surfacePage:     primitiveColors.gray[50],       // #F9FAFB
  surfaceCard:     primitiveColors.gray[0],         // #FFFFFF
  surfaceMuted:    primitiveColors.gray[100],       // #F3F4F6

  // Borders — likewise pinned to cool `gray` (see Surfaces note above).
  borderDefault:   primitiveColors.gray[200],       // #E5E7EB
  borderStrong:    primitiveColors.gray[300],       // #D1D5DB

  // Interactive (default fallback — overridden by branding.accentColor at runtime).
  // Pinned to the cool `blue` ramp: the app rebranded interactive.* to coral for
  // landing-consistency, but transactional emails stay on the prior blue (out of
  // that scope; per-community branding still overrides via accentColor).
  interactivePrimary:      primitiveColors.blue[600], // #2563EB
  interactivePrimaryHover: primitiveColors.blue[700], // #1D4ED8

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

  // Status — info. Pinned to the cool `blue` ramp: the app moved status.info to
  // teal for landing-consistency, but transactional emails keep the prior blue
  // (out of that scope — same reasoning as the notes above).
  infoForeground: primitiveColors.blue[700],             // #1D4ED8
  infoBackground: primitiveColors.blue[50],              // #EFF6FF
  infoBorder:     primitiveColors.blue[200],             // #BFDBFE
  infoSubtle:     primitiveColors.blue[100],             // #DBEAFE

  // Status — neutral
  neutralForeground: toHex(t.status.neutral.foreground), // #4B5563
  neutralBackground: toHex(t.status.neutral.background), // #F3F4F6
  neutralBorder:     toHex(t.status.neutral.border),     // #E5E7EB
  neutralSubtle:     toHex(t.status.neutral.subtle),     // #F9FAFB

  // ── Redesign v2: zinc-neutral system ──────────────────────────────────

  // Core zinc palette
  foreground:      '#09090B',  // zinc-950
  mutedForeground: '#71717A',  // zinc-500 (WCAG AA 4.7:1 on white)
  footerText:      '#A1A1AA',  // zinc-400
  background:      '#FFFFFF',
  muted:           '#F4F4F5',  // zinc-100
  border:          '#E4E4E7',  // zinc-200
  ring:            '#D4D4D8',  // zinc-300

  // Button variants
  buttonDefault:     '#18181B',  // zinc-900
  buttonDefaultText: '#FAFAFA',
  buttonDestructive: '#DC2626',  // red-600
  buttonWarning:     '#CA8A04',  // yellow-600
  buttonSuccess:     '#16A34A',  // green-600
  buttonViolet:      '#7C3AED',  // violet-600

  // Accent stripe colors (top of email card)
  accentBlue:    '#2563EB',
  accentGreen:   '#16A34A',
  accentRed:     '#DC2626',
  accentViolet:  '#7C3AED',
  accentWarning: '#CA8A04',
  accentNeutral: '#71717A',
  accentBorder:  '#E4E4E7',

  // Alert component variants (full 1px border style)
  alertDangerBg:     '#FEF2F2',
  alertDangerBorder: '#FECACA',
  alertDangerText:   '#991B1B',  // red-800
  alertWarningBg:    '#FEFCE8',
  alertWarningBorder:'#FDE68A',
  alertWarningText:  '#854D0E',  // yellow-800
  alertSuccessBg:    '#F0FDF4',
  alertSuccessBorder:'#BBF7D0',
  alertSuccessText:  '#166534',  // green-800
  alertInfoBg:       '#DBEAFE',
  alertInfoBorder:   '#93C5FD',  // blue-300
  alertInfoText:     '#1E40AF',  // blue-800
} as const;
