/**
 * Status configuration - single source of truth
 *
 * Maps domain statuses (e.g. "overdue") to semantic variants (e.g. "danger")
 * plus label/icon/priority metadata.
 *
 * This is extracted from the canonical mockup `mockup/PropertyProRedesign.jsx`.
 */

import { StatusVariant } from "../tokens";

export type StatusIconKey = "success" | "warning" | "danger" | "info" | "neutral";

export const STATUS_CONFIG = {
  compliant: { variant: "success", label: "Compliant", icon: "success", priority: 40 },
  completed: { variant: "success", label: "Completed", icon: "success", priority: 50 },

  pending: { variant: "warning", label: "Due Soon", icon: "warning", priority: 10 },
  due_soon: { variant: "warning", label: "Due Soon", icon: "warning", priority: 10 },
  in_progress: { variant: "warning", label: "In Progress", icon: "warning", priority: 20 },

  overdue: { variant: "danger", label: "Overdue", icon: "danger", priority: 0 },

  submitted: { variant: "info", label: "Submitted", icon: "info", priority: 30 },

  // "Brand" status is used for "good but not perfect" progress (80–99%)
  brand: { variant: "brand", label: "Good", icon: "info", priority: 60 },

  neutral: { variant: "neutral", label: "Neutral", icon: "neutral", priority: 999 },
} as const satisfies Record<
  string,
  { variant: StatusVariant; label: string; icon: StatusIconKey; priority: number }
>;

export type StatusKey = keyof typeof STATUS_CONFIG;

export function getStatusConfig(status: StatusKey | string) {
  return (STATUS_CONFIG as Record<string, (typeof STATUS_CONFIG)[StatusKey]>)[status] ?? STATUS_CONFIG.neutral;
}
