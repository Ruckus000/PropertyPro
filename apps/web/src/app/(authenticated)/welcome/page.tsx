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
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import {
  hasChecklistItems,
  getItemKeysForRole,
  CHECKLIST_DISPLAY,
  type ChecklistItemKey,
} from '@/lib/services/onboarding-checklist-service';
import {
  announcements,
  complianceChecklistItems,
  createScopedClient,
  units,
} from '@propertypro/db';
import { eq, and, isNull, desc } from '@propertypro/db/filters';
import { getBrandingForCommunity } from '@/lib/api/branding';
import { WelcomeScreen } from '@/components/onboarding/welcome-screen';

interface WelcomePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Compute a compliance score from checklist items.
 * Items marked not-applicable are excluded. Score = (satisfied / total) * 100.
 */
function computeComplianceScore(
  items: Array<{ documentId: unknown; isApplicable: unknown }>,
): { score: number; totalItems: number; satisfiedItems: number } {
  const applicable = items.filter((i) => i.isApplicable !== false);
  const total = applicable.length;
  if (total === 0) return { score: 0, totalItems: 0, satisfiedItems: 0 };
  const satisfied = applicable.filter((i) => i.documentId != null).length;
  return {
    score: Math.round((satisfied / total) * 100),
    totalItems: total,
    satisfiedItems: satisfied,
  };
}

/**
 * Resolve the effective display role string used by the welcome screen
 * for card selection and greeting text.
 *
 * The v2 role model uses 'resident' | 'manager' | 'pm_admin'. We map back
 * to more descriptive strings using presetKey and isUnitOwner.
 */
function resolveEffectiveDisplayRole(
  role: string,
  presetKey: string | undefined,
  isUnitOwner: boolean,
): string {
  if (role === 'pm_admin') return 'property_manager_admin';
  if (role === 'manager') {
    // Use presetKey if available for specific manager types
    if (presetKey === 'board_president') return 'board_president';
    if (presetKey === 'board_member') return 'board_member';
    if (presetKey === 'cam') return 'cam';
    if (presetKey === 'site_manager') return 'site_manager';
    return 'cam'; // Default manager display
  }
  if (role === 'resident') {
    return isUnitOwner ? 'owner' : 'tenant';
  }
  return role;
}

function resolveLogoUrl(logoPath: string | undefined): string | null {
  if (!logoPath) return null;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  return `${supabaseUrl}/storage/v1/object/public/branding/${logoPath}`;
}

export default async function WelcomePage({ searchParams }: WelcomePageProps) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([
    searchParams,
    headers(),
  ]);

  const context = resolveCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    host: requestHeaders.get('host'),
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
    redirect('/dashboard');
  }

  // Fetch data in parallel
  const scoped = createScopedClient(communityId);
  const [announcementRows, complianceRows, unitRows, branding] = await Promise.all([
    // Latest announcement
    scoped.selectFrom(
      announcements,
      {
        id: announcements.id,
        title: announcements.title,
        publishedAt: announcements.publishedAt,
      },
      and(
        isNull(announcements.archivedAt),
        isNull(announcements.deletedAt),
      ),
    ).orderBy(desc(announcements.publishedAt)).limit(1),

    // Compliance checklist items for score computation
    scoped.selectFrom(
      complianceChecklistItems,
      {
        documentId: complianceChecklistItems.documentId,
        isApplicable: complianceChecklistItems.isApplicable,
      },
      isNull(complianceChecklistItems.deletedAt),
    ),

    // User's unit (for residents)
    membership.role === 'resident'
      ? scoped.selectFrom(
          units,
          {
            unitNumber: units.unitNumber,
            building: units.building,
            floor: units.floor,
          },
          eq(units.ownerUserId, user.id),
        )
      : Promise.resolve([]),

    // Branding
    getBrandingForCommunity(communityId),
  ]);

  // Process results
  const latestAnnouncement = announcementRows[0]
    ? {
        id: announcementRows[0].id as number,
        title: announcementRows[0].title as string,
        publishedAt: (announcementRows[0].publishedAt as Date).toISOString(),
      }
    : null;

  const complianceScore = computeComplianceScore(
    complianceRows as Array<{ documentId: unknown; isApplicable: unknown }>,
  );

  const userUnit = unitRows[0]
    ? {
        unitNumber: unitRows[0].unitNumber as string,
        building: (unitRows[0].building as string | null) ?? null,
        floor: (unitRows[0].floor as number | null) ?? null,
      }
    : null;

  // Resolve effective display role
  const effectiveRole = resolveEffectiveDisplayRole(
    membership.role,
    membership.presetKey,
    membership.isUnitOwner,
  );

  // Resolve checklist display items for the role (server-side, avoiding client import of service)
  const itemKeys = getItemKeysForRole(effectiveRole, membership.communityType);
  const checklistDisplayItems = itemKeys.map((key) => ({
    key,
    displayText: CHECKLIST_DISPLAY[key as ChecklistItemKey] ?? key,
  }));

  // Compute recent activity text
  const recentActivity = latestAnnouncement
    ? `Latest announcement: "${latestAnnouncement.title}"`
    : 'No recent activity to display';

  // Logo URL
  const logoUrl = resolveLogoUrl(branding?.logoPath);

  // First name from auth context
  const firstName = user.fullName?.split(' ')[0] ?? 'there';

  return (
    <WelcomeScreen
      firstName={firstName}
      role={effectiveRole}
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
