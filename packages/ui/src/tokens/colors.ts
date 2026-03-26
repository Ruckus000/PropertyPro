/**
 * Color tokens — re-exported from @propertypro/tokens.
 * packages/ui no longer owns the color source of truth.
 */
export { primitiveColors } from '@propertypro/tokens';

// Semantic colors for web — CSS var() references (unchanged public API)
export const semanticColors = {
  text: {
    primary: "var(--text-primary)",
    secondary: "var(--text-secondary)",
    tertiary: "var(--text-tertiary)",
    disabled: "var(--text-disabled)",
    placeholder: "var(--text-placeholder)",
    inverse: "var(--text-inverse)",
    brand: "var(--text-brand)",
    link: "var(--text-link)",
    linkHover: "var(--text-link-hover)",
  },
  surface: {
    page: "var(--surface-page)",
    default: "var(--surface-card)",
    subtle: "var(--surface-subtle)",
    muted: "var(--surface-muted)",
    elevated: "var(--surface-elevated)",
    sunken: "var(--surface-sunken)",
    hover: "var(--surface-hover)",
    inverse: "var(--surface-inverse)",
    inverseSubtle: "var(--surface-inverse-subtle)",
  },
  border: {
    default: "var(--border-default)",
    subtle: "var(--border-subtle)",
    strong: "var(--border-strong)",
    muted: "var(--border-muted)",
    focus: "var(--border-focus)",
    error: "var(--border-error)",
  },
  interactive: {
    // NOTE: UI uses "default/hover/active" keys, token definitions use
    // "primary/primaryHover/primaryActive". This shim preserves the UI API.
    default: "var(--interactive-primary)",
    hover: "var(--interactive-primary-hover)",
    active: "var(--interactive-primary-active)",
    disabled: "var(--interactive-disabled)",
    subtle: "var(--interactive-subtle)",
    subtleHover: "var(--interactive-subtle-hover)",
    muted: "var(--interactive-muted)",
  },
  status: {
    success: {
      foreground: "var(--status-success)",
      background: "var(--status-success-bg)",
      border: "var(--status-success-border)",
      subtle: "var(--status-success-subtle)",
    },
    brand: {
      foreground: "var(--status-brand)",
      background: "var(--status-brand-bg)",
      border: "var(--status-brand-border)",
      subtle: "var(--status-brand-subtle)",
    },
    warning: {
      foreground: "var(--status-warning)",
      background: "var(--status-warning-bg)",
      border: "var(--status-warning-border)",
      subtle: "var(--status-warning-subtle)",
    },
    danger: {
      foreground: "var(--status-danger)",
      background: "var(--status-danger-bg)",
      border: "var(--status-danger-border)",
      subtle: "var(--status-danger-subtle)",
    },
    info: {
      foreground: "var(--status-info)",
      background: "var(--status-info-bg)",
      border: "var(--status-info-border)",
      subtle: "var(--status-info-subtle)",
    },
    neutral: {
      foreground: "var(--status-neutral)",
      background: "var(--status-neutral-bg)",
      border: "var(--status-neutral-border)",
      subtle: "var(--status-neutral-subtle)",
    },
  },
} as const;

export type StatusVariant = keyof typeof semanticColors.status;

export function getStatusColors(status: StatusVariant) {
  return semanticColors.status[status];
}
