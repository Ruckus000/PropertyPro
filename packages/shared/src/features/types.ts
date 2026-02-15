/**
 * Community feature flags — the canonical interface for conditional logic
 * based on community type.
 *
 * Components MUST check these flags instead of comparing community_type
 * directly (see AGENTS.md "Community Types" section).
 *
 * Adding a new feature flag:
 *   1. Add the property here in CommunityFeatures
 *   2. Set its value for each community type in community-features.ts
 *   3. TypeScript will enforce exhaustive handling via `satisfies`
 */
export interface CommunityFeatures {
  /** Florida statutory compliance checklist (condo/HOA only) */
  readonly hasCompliance: boolean;
  /** Statutory document categories per FL statutes (condo/HOA only) */
  readonly hasStatutoryCategories: boolean;
  /** Lease tracking and renewal management (apartment only) */
  readonly hasLeaseTracking: boolean;
  /** Board/owner/general meetings and notices */
  readonly hasMeetings: boolean;
  /** Public notices page for statutory posting requirements (condo/HOA only) */
  readonly hasPublicNoticesPage: boolean;
  /** Owner role is valid in this community type (condo/HOA only) */
  readonly hasOwnerRole: boolean;
  /** Voting features for board elections and owner votes (condo/HOA only) */
  readonly hasVoting: boolean;
  /** Requires a public-facing website per FL statute (condo/HOA only) */
  readonly requiresPublicWebsite: boolean;
  /** Maintenance request submission and tracking */
  readonly hasMaintenanceRequests: boolean;
  /** Community announcements and bulletin board */
  readonly hasAnnouncements: boolean;
}
