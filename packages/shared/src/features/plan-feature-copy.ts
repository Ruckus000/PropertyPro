/**
 * Marketing copy for plan-gated features.
 *
 * Used by the upgrade dialog and the locked-feature page hero. Copy lives
 * here (not inside components) so wording changes don't require touching
 * gating logic, and so a single feature key has one canonical pitch.
 *
 * Only features that are PLAN-gated need entries here. Features that are
 * always-on (e.g. announcements, documents) or community-type-gated
 * (e.g. compliance, lease tracking) are intentionally omitted — when
 * those gates fire, hide the surface rather than render a marketing one.
 */
import type { CommunityFeatures } from './types';

export interface PlanFeatureCopy {
  /** Short noun-phrase title — used as the dialog heading and locked-screen H1. */
  readonly displayName: string;
  /** One-sentence value prop, shown right under the heading. */
  readonly tagline: string;
  /** Three short benefit bullets shown as a checklist. */
  readonly benefits: readonly [string, string, string];
}

export const PLAN_FEATURE_COPY: Partial<Record<keyof CommunityFeatures, PlanFeatureCopy>> = {
  hasEsign: {
    displayName: 'E-Signature',
    tagline: 'Send, sign, and track documents without leaving PropertyPro.',
    benefits: [
      'Reusable templates for leases, disclosures, and consent forms',
      'Audit-ready signing trail with timestamps and IP capture',
      'Email reminders that nudge signers until every field is complete',
    ],
  },
  hasViolations: {
    displayName: 'Violations Management',
    tagline: 'Run a fair, paper-trailed violation workflow your board can defend.',
    benefits: [
      'Photo intake, hearing notices, and fine schedules in one inbox',
      'Automatic 14-day notice timers per Florida statute',
      'Resident self-service to view, dispute, or pay outstanding fines',
    ],
  },
  hasARC: {
    displayName: 'Architectural Review',
    tagline: 'Review architectural change requests with structured decisions.',
    benefits: [
      'Required-rule citations on every denial (HB 1203 compliant)',
      'Photo + drawing uploads attached to each application',
      'Decision dashboard for the ARC committee',
    ],
  },
  hasMaintenanceRequests: {
    displayName: 'Maintenance Requests',
    tagline: 'A clean intake → triage → resolution flow for resident requests.',
    benefits: [
      'Status updates that auto-notify the requester',
      'Photo attachments and unit-level history',
      'Vendor handoffs without losing the conversation thread',
    ],
  },
  hasFinance: {
    displayName: 'Finance & Assessments',
    tagline: 'Run assessments, track payments, and report on receivables.',
    benefits: [
      'Recurring assessment schedules with automatic invoicing',
      'Owner-facing balance + pay-online (Stripe-backed)',
      'Aging reports and delinquency workflows',
    ],
  },
  hasVoting: {
    displayName: 'Owner Voting',
    tagline: 'Run statute-compliant elections and owner votes online.',
    benefits: [
      'Per-unit voter authentication (§718.128 / §720.317)',
      'Secret ballot for elections, with proxy support',
      'Live quorum tracking and audit log',
    ],
  },
  hasPolls: {
    displayName: 'Community Polls',
    tagline: 'Take the temperature of your community before formal votes.',
    benefits: [
      'One-click polls with optional comments',
      'Live results that respect privacy when you need it',
      'Reusable poll templates for recurring questions',
    ],
  },
  hasCommunityBoard: {
    displayName: 'Community Board',
    tagline: 'Give residents and the board a focused place to talk.',
    benefits: [
      'Threaded discussions with category filters',
      'Pinned announcements that float to the top',
      'Moderation tools to keep the conversation healthy',
    ],
  },
  hasWorkOrders: {
    displayName: 'Work Orders',
    tagline: 'Dispatch vendors and track jobs from request to invoice.',
    benefits: [
      'Vendor directory with ratings and service history',
      'Status board across open, scheduled, and completed work',
      'Cost tracking that flows into your finance reports',
    ],
  },
  hasAmenities: {
    displayName: 'Amenity Reservations',
    tagline: 'Let residents book amenities while you keep control.',
    benefits: [
      'Resource calendars with double-booking prevention',
      'Configurable rules: hours, deposits, blackout dates',
      'Resident self-service that respects your policies',
    ],
  },
  hasCalendarSync: {
    displayName: 'Calendar Sync',
    tagline: 'Get community meetings into your team’s real calendar.',
    benefits: [
      'ICS feeds for personal calendars (Apple, Outlook, Fastmail)',
      'Google Calendar two-way sync for board members',
      'My-meetings view that filters to what each user attends',
    ],
  },
  hasAccountingConnectors: {
    displayName: 'Accounting Connectors',
    tagline: 'Sync transactions to QuickBooks or Xero automatically.',
    benefits: [
      'Two-way sync of payments, deposits, and invoices',
      'GL mapping that matches your chart of accounts',
      'Reconciliation reports with one click',
    ],
  },
  hasPackageLogging: {
    displayName: 'Package Logging',
    tagline: 'Track package intake and resident pickups without paper logs.',
    benefits: [
      'Quick photo intake with auto-notify to the recipient',
      'Pickup signatures with a chain of custody',
      'Aging reports for unclaimed packages',
    ],
  },
  hasVisitorLogging: {
    displayName: 'Visitor Logging',
    tagline: 'Know who is in the building without slowing the front desk.',
    benefits: [
      'Pre-authorized visitor lists per unit',
      'Quick check-in/out at the front desk',
      'Reports for security audits and incidents',
    ],
  },
};

/** Fallback copy when a specific feature has no curated entry yet. */
export const DEFAULT_PLAN_FEATURE_COPY: PlanFeatureCopy = {
  displayName: 'Premium Feature',
  tagline: 'Available on a higher plan.',
  benefits: [
    'Unlock advanced workflows for your community',
    'Empower your board and staff with better tools',
    'Save time with automation and reporting',
  ],
};

export function getPlanFeatureCopy(featureKey: keyof CommunityFeatures): PlanFeatureCopy {
  return PLAN_FEATURE_COPY[featureKey] ?? DEFAULT_PLAN_FEATURE_COPY;
}
