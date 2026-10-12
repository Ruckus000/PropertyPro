/**
 * Welcome page — the first screen an invited user sees after signing up.
 *
 * Server component that fetches community data, compliance snapshot,
 * latest announcement, and user context, then delegates to the
 * WelcomeScreen client component for interactive rendering.
 *
 * If the user already has checklist items (i.e. they have already been
 * welcomed), they are redirected straight to the dashboard.
 */
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import {
  requirePageAuthenticatedUser,
} from '@/lib/request/page-auth-context';
import {
  requirePageCommunityMembership,
} from '@/lib/request/page-community-context';
import { resolvePageCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import {
  hasChecklistItems,
  getItemKeysForRole,
  CHECKLIST_DISPLAY,
  type ChecklistItemKey,
} from '@/lib/services/onboarding-checklist-service';
import {
  announcements,
  createScopedClient,
  units,
  type Announcement,
} from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { loadChecklistWithStatus } from '@/lib/compliance/load-checklist-with-status';
import { buildComplianceSummary } from '@/lib/utils/compliance-calculator';
import type { ChecklistItemData } from '@/components/compliance/compliance-checklist-item';
import { getBrandingForCommunity } from '@/lib/api/branding';
import { resolveBrandingImageUrl } from '@/lib/branding/branding-image-url';
import {
  filterVisibleAnnouncements,
  getAnnouncementCommunityContext,
} from '@/lib/announcements/read-visibility';
import { WelcomeScreen } from '@/components/onboarding/welcome-screen';
import { checkPermissionV2 } from '@/lib/db/access-control';
import { listActorUnitIds } from '@/lib/units/actor-units';

interface WelcomePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** The resident's unit: the role's assigned unit first, then any unit they own. */
async function findResidentUnit(
  scoped: ReturnType<typeof createScopedClient>,
  userId: string,
): Promise<Array<Record<string, unknown>>> {
  const [unitId] = await listActorUnitIds(scoped, userId);
  if (unitId === undefined) return [];
  return scoped.selectFrom(
    units,
    {
      unitNumber: units.unitNumber,
      building: units.building,
      floor: units.floor,
    },
    eq(units.id, unitId),
  );
}

export default async function WelcomePage({ searchParams }: WelcomePageProps) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([
    searchParams,
    headers(),
  ]);

  const context = resolvePageCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    headers: requestHeaders,
  });

  if (!context.communityId) {
    redirect('/select-community');
  }

  const communityId = context.communityId;

  // Auth + membership
  const user = await requirePageAuthenticatedUser();
  const membership = await requirePageCommunityMembership(communityId, user.id);

  // If the user already has checklist items, they have already been welcomed
  const alreadyWelcomed = await hasChecklistItems(communityId, user.id);
  if (alreadyWelcomed) {
    redirect(`/dashboard?communityId=${communityId}`);
  }

  // The score is only computed for members who may read compliance — the same
  // gate as GET /api/v1/compliance. Tenants (and every apartment member) get
  // the empty snapshot, which the cards already render as "not yet set up".
  const canReadCompliance = checkPermissionV2(
    membership.role,
    membership.communityType,
    'compliance',
    'read',
    { isUnitOwner: membership.isUnitOwner },
  );

  // Fetch data in parallel
  const scoped = createScopedClient(communityId);
  const [announcementRows, complianceRows, unitRows, branding] = await Promise.all([
    scoped.query(announcements),

    // The checklist with derived status — the compliance page's own loader,
    // so this score always matches that page (audit F8).
    canReadCompliance
      ? loadChecklistWithStatus(communityId, membership.communityType)
      : Promise.resolve([]),

    // User's unit (for residents). The assigned unit lives on the role row
    // (every resident requires one — role-validator's UNIT_REQUIRED_ROLES), so
    // resolve it the way the rest of the app does. Looking it up by
    // `units.ownerUserId` alone meant a tenant never saw their unit.
    membership.role === 'resident' ? findResidentUnit(scoped, user.id) : Promise.resolve([]),

    // Branding
    getBrandingForCommunity(communityId),
  ]);

  // Process results
  const { rows: visibleAnnouncements } = await filterVisibleAnnouncements(
    getAnnouncementCommunityContext(membership),
    membership,
    announcementRows as Announcement[],
    { limit: 1 },
  );
  const latestAnnouncement = visibleAnnouncements[0]
    ? {
        id: visibleAnnouncements[0].id,
        title: visibleAnnouncements[0].title,
        publishedAt: visibleAnnouncements[0].publishedAt.toISOString(),
      }
    : null;

  const { readiness } = buildComplianceSummary(complianceRows as unknown as ChecklistItemData[]);
  const complianceScore = {
    // No applicable items means nothing to score; the cards then say "not
    // set up yet" (the summary's own 100% is for the compliance page header).
    score: readiness.applicableTotal === 0 ? 0 : readiness.percentage,
    totalItems: readiness.applicableTotal,
    satisfiedItems: readiness.satisfied,
  };

  const userUnit = unitRows[0]
    ? {
        unitNumber: unitRows[0].unitNumber as string,
        building: (unitRows[0].building as string | null) ?? null,
        floor: (unitRows[0].floor as number | null) ?? null,
      }
    : null;

  // Resolve checklist display items for the role (server-side, avoiding client import of service)
  const itemKeys = getItemKeysForRole(membership);
  const checklistDisplayItems = itemKeys.map((key) => ({
    key,
    displayText: CHECKLIST_DISPLAY[key as ChecklistItemKey] ?? key,
  }));

  // Compute recent activity text
  const recentActivity = latestAnnouncement
    ? `Latest announcement: "${latestAnnouncement.title}"`
    : 'No recent activity to display';

  // Logo URL
  const logoUrl = await resolveBrandingImageUrl(communityId, branding?.logoPath);

  // First name from auth context
  const firstName = user.fullName?.split(' ')[0] ?? 'there';

  return (
    <WelcomeScreen
      firstName={firstName}
      role={membership.role}
      designation={membership.designation}
      isUnitOwner={membership.isUnitOwner}
      communityId={communityId}
      community={{
        name: membership.communityName,
        slug: '', // Not needed for display in welcome screen
        city: membership.city,
        state: membership.state,
        communityType: membership.communityType,
      }}
      communityType={membership.communityType}
      announcement={latestAnnouncement}
      compliance={complianceScore}
      unit={userUnit}
      recentActivity={recentActivity}
      logoUrl={logoUrl}
      primaryColor={branding?.primaryColor ?? null}
      checklistDisplayItems={checklistDisplayItems}
    />
  );
}
