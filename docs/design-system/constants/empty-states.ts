/**
 * Empty state configuration - reusable copy + icon mapping
 *
 * Mirrors Phase 4 scenarios from the implementation plan and canonical mockup.
 */

export type EmptyStateIconKey =
  | "upload"
  | "users"
  | "bell"
  | "wrench"
  | "alert"
  | "wifi-off"
  | "check";

export interface EmptyStateConfig {
  title: string;
  description: string;
  actionLabel?: string;
  icon: EmptyStateIconKey;
}

export const EMPTY_STATE_CONFIGS = {
  compliance_new_association: {
    title: "Let's get you compliant",
    description: "Upload your first document to start tracking Florida Statute compliance.",
    actionLabel: "Upload Document",
    icon: "upload",
  },
  no_owners_registered: {
    title: "Add your first owner",
    description: "Import owners via CSV or add them manually to enable portal access.",
    actionLabel: "Add Owners",
    icon: "users",
  },
  no_announcements: {
    title: "Keep your community informed",
    description: "Post announcements to notify owners about meetings, updates, and community news.",
    actionLabel: "Create Announcement",
    icon: "bell",
  },
  no_maintenance_requests: {
    title: "All clear!",
    description: "There are no open maintenance requests. Residents can submit requests through the portal.",
    icon: "wrench",
  },
  api_error: {
    title: "Something went wrong",
    description: "We couldn't load this data. Please try again.",
    actionLabel: "Retry",
    icon: "alert",
  },
  offline: {
    title: "You're offline",
    description: "Check your internet connection and try again.",
    actionLabel: "Retry",
    icon: "wifi-off",
  },
  action_required_clear: {
    title: "You're all set!",
    description: "No items currently require your attention.",
    icon: "check",
  },
} as const satisfies Record<string, EmptyStateConfig>;

export type EmptyStateKey = keyof typeof EMPTY_STATE_CONFIGS;

export function getEmptyStateConfig(key: EmptyStateKey) {
  return EMPTY_STATE_CONFIGS[key];
}
