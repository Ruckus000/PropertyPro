/**
 * Status configuration — THE single source of truth for status display.
 *
 * Maps domain statuses to semantic variants (color scheme),
 * label text, icon key, and sort priority.
 *
 * Consumed by StatusBadge (packages/ui) and re-exported to apps via
 * apps/web/src/lib/constants/status.ts.
 */

import type { StatusVariant } from "../tokens/colors";

export type StatusIconKey = "success" | "warning" | "danger" | "info" | "neutral";

export interface StatusConfigEntry {
  variant: StatusVariant;
  label: string;
  icon: StatusIconKey;
  priority: number;
}

export const STATUS_CONFIG = {
  compliant: { variant: "success", label: "Compliant", icon: "success", priority: 40 },
  completed: { variant: "success", label: "Completed", icon: "success", priority: 50 },
  satisfied: { variant: "success", label: "Satisfied", icon: "success", priority: 45 },
  certified: { variant: "success", label: "Certified", icon: "success", priority: 48 },

  pending: { variant: "warning", label: "Due Soon", icon: "warning", priority: 10 },
  due_soon: { variant: "warning", label: "Due Soon", icon: "warning", priority: 10 },
  assigned: { variant: "warning", label: "Assigned", icon: "warning", priority: 18 },
  in_progress: { variant: "warning", label: "In Progress", icon: "warning", priority: 20 },
  review: { variant: "warning", label: "Under Review", icon: "warning", priority: 15 },

  overdue: { variant: "danger", label: "Overdue", icon: "danger", priority: 0 },
  rejected: { variant: "danger", label: "Rejected", icon: "danger", priority: 5 },
  canceled: { variant: "danger", label: "Canceled", icon: "danger", priority: 3 },
  cancelled: { variant: "danger", label: "Cancelled", icon: "danger", priority: 3 },

  submitted: { variant: "info", label: "Submitted", icon: "info", priority: 30 },
  created: { variant: "info", label: "Created", icon: "info", priority: 22 },
  confirmed: { variant: "info", label: "Confirmed", icon: "info", priority: 24 },
  open: { variant: "info", label: "Open", icon: "info", priority: 25 },
  closed: { variant: "neutral", label: "Closed", icon: "neutral", priority: 55 },
  draft: { variant: "neutral", label: "Draft", icon: "neutral", priority: 12 },

  brand: { variant: "brand", label: "Good", icon: "info", priority: 60 },
  not_applicable: { variant: "neutral", label: "N/A", icon: "neutral", priority: 100 },
  neutral: { variant: "neutral", label: "Neutral", icon: "neutral", priority: 999 },
} as const satisfies Record<string, StatusConfigEntry>;

export type StatusKey = keyof typeof STATUS_CONFIG;

export function getStatusConfig(status: StatusKey | string): StatusConfigEntry {
  // `hasOwnProperty`, not `??`: STATUS_CONFIG is an object literal, so it
  // inherits from Object.prototype. A status of "constructor" / "toString" /
  // "valueOf" resolves to a TRUTHY inherited value, the `??` never fires, and
  // the caller gets an entry whose variant/label/icon are all undefined.
  // `STATUS_ICONS[undefined]` is then undefined and React throws "Element type
  // is invalid", blanking the subtree — reachable from any DB column or API
  // payload passed straight to <StatusBadge status={...} />.
  const own = Object.prototype.hasOwnProperty.call(STATUS_CONFIG, status)
    ? (STATUS_CONFIG as Record<string, StatusConfigEntry | undefined>)[status]
    : undefined;
  return own ?? STATUS_CONFIG.neutral;
}

/**
 * Maps a StatusVariant to Tailwind semantic token classes.
 * Returns { text, bg, border, subtle, dot } class strings.
 *
 * WRITTEN OUT IN FULL, DELIBERATELY. These were built by interpolation
 * (`text-status-${variant}`), which Tailwind's scanner cannot see: it reads
 * source TEXT, so an assembled class name is never a candidate and never
 * emits CSS. The variants happened to render only because other files spell
 * `text-status-danger` and friends out statically; `owner` and `board`, which
 * nothing else spells out, silently rendered as no colour at all.
 *
 * Any new StatusVariant must be added here as literal strings AND declared in
 * the consuming app's Tailwind config. `pnpm guard:web-semantic-css` fails on
 * both mistakes.
 */
const STATUS_CLASSES = {
  success: {
    text: "text-status-success",
    bg: "bg-status-success-bg",
    border: "border-status-success-border",
    subtle: "bg-status-success-subtle",
    dot: "bg-status-success",
  },
  brand: {
    text: "text-status-brand",
    bg: "bg-status-brand-bg",
    border: "border-status-brand-border",
    subtle: "bg-status-brand-subtle",
    dot: "bg-status-brand",
  },
  warning: {
    text: "text-status-warning",
    bg: "bg-status-warning-bg",
    border: "border-status-warning-border",
    subtle: "bg-status-warning-subtle",
    dot: "bg-status-warning",
  },
  danger: {
    text: "text-status-danger",
    bg: "bg-status-danger-bg",
    border: "border-status-danger-border",
    subtle: "bg-status-danger-subtle",
    dot: "bg-status-danger",
  },
  info: {
    text: "text-status-info",
    bg: "bg-status-info-bg",
    border: "border-status-info-border",
    subtle: "bg-status-info-subtle",
    dot: "bg-status-info",
  },
  neutral: {
    text: "text-status-neutral",
    bg: "bg-status-neutral-bg",
    border: "border-status-neutral-border",
    subtle: "bg-status-neutral-subtle",
    dot: "bg-status-neutral",
  },
  owner: {
    text: "text-status-owner",
    bg: "bg-status-owner-bg",
    border: "border-status-owner-border",
    subtle: "bg-status-owner-subtle",
    dot: "bg-status-owner",
  },
  board: {
    text: "text-status-board",
    bg: "bg-status-board-bg",
    border: "border-status-board-border",
    subtle: "bg-status-board-subtle",
    dot: "bg-status-board",
  },
} as const satisfies Record<StatusVariant, Record<string, string>>;

/**
 * The result is a `Readonly` view of a SHARED module-level entry, not a fresh
 * object per call. Without the readonly return type a single caller's write —
 * a codemod, a test helper, a stray `classes.text += ' foo'` — corrupts the
 * class strings for every StatusBadge and StatusDot for the life of the
 * process. Do not widen it.
 *
 * `hasOwnProperty` is not redundant with the `StatusVariant` type. Types do not
 * survive to runtime, and a caller doing
 * `getStatusClasses(getStatusConfig(someString).variant)` can pass `undefined`
 * or a prototype key.
 */
export function getStatusClasses(
  variant: StatusVariant,
): Readonly<(typeof STATUS_CLASSES)[StatusVariant]> {
  return Object.prototype.hasOwnProperty.call(STATUS_CLASSES, variant)
    ? STATUS_CLASSES[variant]
    : STATUS_CLASSES.neutral;
}
