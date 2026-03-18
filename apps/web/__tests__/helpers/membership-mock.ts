// Pure data factory — no vi.fn() calls. Returns the full membership shape used by route tests.
export function makeAdminMembership(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'session-user-1',
    communityId: 42,
    role: 'manager',
    isAdmin: true,
    isUnitOwner: false,
    displayTitle: 'Board President',
    presetKey: 'board_president',
    permissions: {
      resources: {
        documents: { read: true, write: true },
        meetings: { read: true, write: true },
        announcements: { read: true, write: true },
        residents: { read: true, write: true },
        settings: { read: true, write: true },
        audit: { read: true, write: false },
        compliance: { read: true, write: true },
        maintenance: { read: true, write: true },
        contracts: { read: true, write: true },
        finances: { read: true, write: true },
        violations: { read: true, write: true },
        arc_submissions: { read: true, write: true },
        polls: { read: true, write: true },
        work_orders: { read: true, write: true },
        amenities: { read: true, write: true },
        packages: { read: true, write: true },
        visitors: { read: true, write: true },
        calendar_sync: { read: true, write: true },
        accounting: { read: true, write: true },
        esign: { read: true, write: true },
        emergency_broadcasts: { read: true, write: true },
      },
    },
    communityType: 'condo_718',
    timezone: 'America/New_York',
    ...overrides,
  };
}

export function makeReadOnlyMembership(overrides: Record<string, unknown> = {}) {
  const base = makeAdminMembership(overrides);
  // Zero out all write permissions
  for (const key of Object.keys(base.permissions.resources)) {
    (base.permissions.resources as Record<string, { read: boolean; write: boolean }>)[key].write = false;
  }
  return base;
}
