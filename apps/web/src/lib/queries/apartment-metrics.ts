/**
 * Apartment operational dashboard metrics — P2-36
 *
 * Loads all metrics needed for the apartment dashboard in parallel.
 * Uses scoped client for tenant isolation.
 *
 * Date arithmetic note: Lease endDate is stored as YYYY-MM-DD (date type).
 * We parse it as UTC midnight using `dateStr + 'T00:00:00Z'` to avoid
 * local-timezone off-by-one errors (verified from lease-expiration-service.ts).
 * We do NOT use date-fns addDays because it uses local time internally.
 */
import {
  announcements,
  communities,
  createScopedClient,
  leases,
  maintenanceRequests,
  units,
  users,
  type Announcement,
  type Lease,
  type Unit,
} from '@propertypro/db';
import {
  selectRecentAnnouncements,
  toFirstName,
  type DashboardAnnouncement,
} from '../dashboard/dashboard-selectors';
import { resolveTimezone } from '@/lib/utils/timezone';

export interface LeaseExpirationWindows {
  within30Days: number;
  within60Days: number;
  within90Days: number;
}

export interface ApartmentMetrics {
  firstName: string;
  communityName: string;
  timezone: string;
  occupiedUnits: number;
  vacantUnits: number;
  totalUnits: number;
  occupancyRate: number;
  leaseExpirations: LeaseExpirationWindows;
  totalMonthlyRevenue: number;
  openMaintenanceRequests: number;
  announcements: DashboardAnnouncement[];
}

/** Parse YYYY-MM-DD as UTC midnight. Same approach as lease-expiration-service.ts. */
function parseUtcDate(dateStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const d = new Date(dateStr + 'T00:00:00Z');
  return isNaN(d.getTime()) ? null : d;
}

/** UTC-safe window boundary: midnight UTC N days from now. */
function utcDaysFromNow(days: number): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + days * 86400000;
}

export async function loadApartmentMetrics(
  communityId: number,
  userId: string,
): Promise<ApartmentMetrics> {
  const scoped = createScopedClient(communityId);

  const [unitRows, leaseRows, maintenanceRows, announcementRows, communityRows, userRows] =
    await Promise.all([
      scoped.query(units),
      scoped.query(leases),
      scoped.query(maintenanceRequests),
      scoped.query(announcements),
      scoped.query(communities),
      scoped.query(users),
    ]);

  // Community metadata
  const community = communityRows.find((r) => r['id'] === communityId);
  const communityName =
    typeof community?.['name'] === 'string' ? (community['name'] as string) : 'Community';
  const timezone = resolveTimezone(community?.['timezone'] as string | undefined);

  // User first name
  const user = userRows.find((r) => r['id'] === userId);
  const fullName = typeof user?.['fullName'] === 'string' ? (user['fullName'] as string) : null;

  // Active leases (not soft-deleted)
  const activeLeases = (leaseRows as Lease[]).filter(
    (l) => l.status === 'active' && l.deletedAt == null,
  );

  // Occupancy
  const liveUnits = (unitRows as Unit[]).filter((u) => u.deletedAt == null);
  const occupiedUnitIds = new Set(activeLeases.map((l) => l.unitId));
  const totalUnits = liveUnits.length;
  const occupiedUnits = occupiedUnitIds.size;
  const vacantUnits = totalUnits - occupiedUnits;
  const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

  // Lease expirations (UTC-safe)
  const d30 = utcDaysFromNow(30);
  const d60 = utcDaysFromNow(60);
  const d90 = utcDaysFromNow(90);
  const nowMs = Date.now();

  const expiringLeases = activeLeases.filter((l) => l.endDate != null);
  function countExpiring(boundaryMs: number): number {
    return expiringLeases.filter((l) => {
      const end = parseUtcDate(l.endDate!);
      if (!end) return false;
      const endMs = end.getTime();
      return endMs >= nowMs && endMs <= boundaryMs;
    }).length;
  }

  const leaseExpirations: LeaseExpirationWindows = {
    within30Days: countExpiring(d30),
    within60Days: countExpiring(d60),
    within90Days: countExpiring(d90),
  };

  // Revenue
  const totalMonthlyRevenue = activeLeases.reduce((sum, l) => {
    const amount = l.rentAmount != null ? parseFloat(String(l.rentAmount)) : 0;
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);

  // Open maintenance requests
  const openMaintenanceRequests = (
    maintenanceRows as { status: string; deletedAt: Date | null }[]
  ).filter((r) => r.status === 'open' && r.deletedAt == null).length;

  // Recent announcements
  const recentAnnouncements = selectRecentAnnouncements(announcementRows as Announcement[]);

  return {
    firstName: toFirstName(fullName),
    communityName,
    timezone,
    occupiedUnits,
    vacantUnits,
    totalUnits,
    occupancyRate,
    leaseExpirations,
    totalMonthlyRevenue,
    openMaintenanceRequests,
    announcements: recentAnnouncements,
  };
}
