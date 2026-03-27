/**
 * Status configuration — single source of truth for status display.
 *
 * Maps domain statuses to semantic variants (color scheme),
 * label text, icon key, and sort priority.
 *
 * Source: docs/design-system/constants/status.ts
 */

export type StatusVariant =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "brand";

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
  return (
    (STATUS_CONFIG as Record<string, StatusConfigEntry>)[status] ??
    STATUS_CONFIG.neutral
  );
}

/**
 * Maps a StatusVariant to Tailwind semantic token classes.
 * Returns { text, bg, border, subtle } class strings.
 */
export function getStatusClasses(variant: StatusVariant) {
  return {
    text: `text-status-${variant}`,
    bg: `bg-status-${variant}-bg`,
    border: `border-status-${variant}-border`,
    subtle: `bg-status-${variant}-subtle`,
  } as const;
}
