/**
 * Leases help articles — the single list of slugs the Leases page links to.
 *
 * Every value is the filename of an MDX article in
 * `apps/web/src/content/help/manager/leases/<slug>.mdx` (category `leases`).
 * UnitPanel and AlertWindowsMenu pass these constants to `onHelp`, and
 * `__tests__/help-slugs.test.ts` fails if any slug has no article, so renaming
 * an article can't leave a dead help link on the page.
 */
export const LEASE_HELP_CATEGORY = 'leases' as const;

export const LEASE_HELP_SLUGS = {
  /** Landing article: page layout, where each task starts, undo. */
  overview: 'managing-leases',
  /** Tiles, statuses, Lease end colours and the Renewal column. */
  statuses: 'lease-statuses',
  // Start a lease
  addingALease: 'adding-a-lease',
  upcomingLease: 'upcoming-lease',
  depositNotice: 'deposit-notice',
  editingALease: 'editing-a-lease',
  // Renew (UnitPanel "How renewals work" links here for non-holdovers)
  renewingALease: 'renewing-a-lease',
  recordingARenewal: 'recording-a-renewal',
  // End a lease (UnitPanel "How renewals work" links here for holdovers)
  moveOutAndHoldovers: 'move-out-and-holdovers',
  endingALeaseEarly: 'ending-a-lease-early',
  transferringUnits: 'transferring-units',
  // Settings and reference
  unitOffline: 'unit-offline',
  /** AlertWindowsMenu "How alert windows work". */
  expiryAlertWindows: 'expiry-alert-windows',
} as const;

export type LeaseHelpSlug = (typeof LEASE_HELP_SLUGS)[keyof typeof LEASE_HELP_SLUGS];

/** In-app path of a Leases help article. */
export function leaseHelpPath(slug: LeaseHelpSlug): string {
  return `/help/${LEASE_HELP_CATEGORY}/${slug}`;
}
