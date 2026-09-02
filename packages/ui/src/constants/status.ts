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
  // the caller gets an entry whose variant/label/icon are all undefined —
  // `STATUS_ICONS[undefined]` is then undefined and React throws "Element type
  // is invalid", blanking the subtree. Reachable from any DB column or API
  // payload passed straight to <StatusBadge status={...} />.
  const own = Object.prototype.hasOwnProperty.call(STATUS_CONFIG, status)
    ? (STATUS_CONFIG as Record<string, StatusConfigEntry | undefined>)[status]
    : undefined;
  return own ?? STATUS_CONFIG.neutral;
}

export interface StatusClasses {
  /** Foreground/text colour. */
  text: string;
  /** Filled badge background. */
  bg: string;
  /** Badge border colour. */
  border: string;
  /** Subtle (tinted) badge background. */
  subtle: string;
  /** Solid fill for the dot indicator — the foreground colour used as a background. */
  dot: string;
}

/**
 * Every Tailwind class this module can hand out, written LITERALLY.
 *
 * These strings must never be assembled at runtime — not with a template
 * literal, not with `.replace()`. Tailwind's scanner reads raw file TEXT and
 * never evaluates JavaScript, so a class it cannot see as a complete literal is
 * simply not generated. That is not an error: the utility emits no rule and the
 * element renders with no colour at all. Nothing throws, nothing logs, and
 * `guard:design-tokens` cannot see it either — it checks that raw palette
 * classes are gone, not that the semantic class you used resolves to anything.
 *
 * This map previously WAS a template literal, and StatusBadge built the dot
 * colour with `classes.text.replace("text-", "bg-")`. The six variants that
 * appeared to work only did so because unrelated files elsewhere in the tree
 * happened to spell the same class out; measured against a real Tailwind build,
 * five of the eight dot colours (info, neutral, brand, owner, board) emitted no
 * CSS and rendered as invisible dots.
 *
 * `satisfies Record<StatusVariant, StatusClasses>` is the other half of the
 * guard: adding a variant to StatusVariant without adding its literals here is
 * a type error, rather than another silently colourless element.
 *
 * The classes must also be DECLARED in each app's Tailwind config
 * (`theme.extend.colors.status`) or they still resolve to nothing — see
 * apps/web/__tests__/design-system/status-variant-css.test.ts, which checks
 * both halves.
 */
const STATUS_CLASSES = {
  success: {
    text: "text-status-success",
    bg: "bg-status-success-bg",
    border: "border-status-success-border",
    subtle: "bg-status-success-subtle",
    dot: "bg-status-success",
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
  brand: {
    text: "text-status-brand",
    bg: "bg-status-brand-bg",
    border: "border-status-brand-border",
    subtle: "bg-status-brand-subtle",
    dot: "bg-status-brand",
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
} as const satisfies Record<StatusVariant, StatusClasses>;

/**
 * Maps a StatusVariant to Tailwind semantic token classes.
 * Returns { text, bg, border, subtle, dot } class strings.
 *
 * The result is a `Readonly` view of a SHARED module-level entry, not a fresh
 * object per call. Mutating it would corrupt every StatusBadge and StatusDot
 * for the lifetime of the process, so the readonly return type is load-bearing
 * — do not widen it to plain `StatusClasses`.
 *
 * The `hasOwnProperty` guard is NOT redundant with the `StatusVariant` type.
 * Its real trigger is the prototype-key path above: a caller doing
 * `getStatusClasses(getStatusConfig(someString).variant)` can pass `undefined`,
 * and a plain lookup would return `Object.prototype`'s member for keys like
 * "constructor". Types do not survive to runtime, and both call sites take
 * their variant from data.
 */
export function getStatusClasses(variant: StatusVariant): Readonly<StatusClasses> {
  return Object.prototype.hasOwnProperty.call(STATUS_CLASSES, variant)
    ? STATUS_CLASSES[variant]
    : STATUS_CLASSES.neutral;
}
