/**
 * Empty state configuration — reusable copy + icon mapping.
 *
 * Source: docs/design-system/constants/empty-states.ts
 */

export type EmptyStateIconKey =
  | "upload"
  | "users"
  | "bell"
  | "wrench"
  | "alert"
  | "wifi-off"
  | "check"
  | "calendar"
  | "file-text"
  | "building"
  | "shield-check"
  | "inbox";

export interface EmptyStateConfig {
  title: string;
  description: string;
  actionLabel?: string;
  icon: EmptyStateIconKey;
}

export const EMPTY_STATE_CONFIGS = {
  compliance_empty: {
    title: "Your compliance tracker is ready",
    description:
      "We've mapped the categories Florida requires. Upload documents to start tracking your score.",
    actionLabel: "Upload First Document",
    icon: "upload",
  },
  no_owners_registered: {
    title: "Add your first owner",
    description:
      "Import owners via CSV or add them manually to enable portal access.",
    actionLabel: "Add Owners",
    icon: "users",
  },
  no_announcements: {
    title: "Keep your community informed",
    description:
      "Post announcements to notify owners about meetings, updates, and community news.",
    actionLabel: "Create Announcement",
    icon: "bell",
  },
  no_maintenance_requests: {
    title: "All clear!",
    description:
      "There are no open maintenance requests. Residents can submit requests through the portal.",
    icon: "wrench",
  },
  no_meetings: {
    title: "Schedule and track board meetings",
    description:
      "Post meeting notices with the required advance notice. PropertyPro tracks the compliance timeline for you.",
    actionLabel: "Schedule Meeting",
    icon: "bell",
  },
  no_documents: {
    title: "Build your document library",
    description:
      "Upload governing documents, financials, and meeting minutes to stay compliant.",
    actionLabel: "Upload Document",
    icon: "file-text",
  },
  no_communities: {
    title: "Add your first community",
    description:
      "Get started by onboarding a community to manage their compliance and operations.",
    actionLabel: "Add Community",
    icon: "building",
  },
  no_violations: {
    title: "Community is in good standing",
    description: "No violations have been reported. Great job!",
    icon: "shield-check",
  },
  no_residents: {
    title: "Add the people in your community",
    description:
      "Import residents via CSV or add them one by one. They'll get portal access to view documents and announcements.",
    actionLabel: "Add Residents",
    icon: "users",
  },
  no_announcements_yet: {
    title: "No announcements yet",
    description:
      "Your board hasn't posted any announcements. You'll be notified when they do.",
    icon: "bell",
  },
  no_esign_pending: {
    title: "No documents awaiting signature",
    description: "All signature requests have been completed.",
    icon: "check",
  },
  no_board_polls: {
    title: "No active polls yet",
    description:
      "Polls will appear here once community leaders create a voting question.",
    icon: "inbox",
  },
  no_board_threads: {
    title: "Start the board conversation",
    description:
      "Forum threads will show up here once someone opens a discussion.",
    icon: "users",
  },
  no_board_elections: {
    title: "No elections to review",
    description:
      "Elections will appear here after the attorney-review gate is enabled and a ballot is created.",
    icon: "shield-check",
  },
  no_operations_items: {
    title: "Nothing in operations right now",
    description:
      "Requests, work orders, and reservations will show up here as they move through the workflow.",
    icon: "wrench",
  },
  no_results: {
    title: "No results found",
    description:
      "Try adjusting your search or filters to find what you're looking for.",
    icon: "inbox",
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

export function getEmptyStateConfig(key: EmptyStateKey): EmptyStateConfig {
  return EMPTY_STATE_CONFIGS[key];
}
