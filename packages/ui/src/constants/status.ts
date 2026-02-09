/**
 * Status configuration — single source of truth
 */

import type { StatusVariant } from "../tokens/colors";

export type StatusIconKey = "success" | "warning" | "danger" | "info" | "neutral";

export const STATUS_CONFIG = {
  compliant: { variant: "success" as const, label: "Compliant", icon: "success" as const, priority: 40 },
  completed: { variant: "success" as const, label: "Completed", icon: "success" as const, priority: 50 },
  pending: { variant: "warning" as const, label: "Due Soon", icon: "warning" as const, priority: 10 },
  due_soon: { variant: "warning" as const, label: "Due Soon", icon: "warning" as const, priority: 10 },
  in_progress: { variant: "warning" as const, label: "In Progress", icon: "warning" as const, priority: 20 },
  overdue: { variant: "danger" as const, label: "Overdue", icon: "danger" as const, priority: 0 },
  submitted: { variant: "info" as const, label: "Submitted", icon: "info" as const, priority: 30 },
  brand: { variant: "brand" as const, label: "Good", icon: "info" as const, priority: 60 },
  neutral: { variant: "neutral" as const, label: "Neutral", icon: "neutral" as const, priority: 999 },
} as const satisfies Record<
  string,
  { variant: StatusVariant; label: string; icon: StatusIconKey; priority: number }
>;

export type StatusKey = keyof typeof STATUS_CONFIG;

export function getStatusConfig(status: StatusKey | string) {
  return (STATUS_CONFIG as Record<string, (typeof STATUS_CONFIG)[StatusKey]>)[status] ?? STATUS_CONFIG.neutral;
}
