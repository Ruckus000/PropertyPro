import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Skeleton } from '@/components/ui/skeleton';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  getEffectiveFeatures,
  getFeaturesForCommunity,
  resolvePlanId,
  type CommunityFeatures,
} from '@propertypro/shared';
import { WebsiteLiveCard } from '@/components/website-home/website-live-card';
import { loadWebsiteLiveCard } from '@/lib/dashboard/load-website-live-card';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { checkPermissionV2 } from '@/lib/db/access-control';
import { loadDashboardData } from '@/lib/dashboard/load-dashboard-data';
import { resolvePageCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { getAuthorizedCommunityIds } from '@/lib/queries/cross-community';
import { getSupportScope } from '@/lib/support/support-scope';
import { OnboardingChecklist } from '@/components/onboarding/onboarding-checklist';
import {
  celebrationNextStepFor,
  type CelebrationNextStep,
} from '@/lib/onboarding/celebration-next-step';
import { DashboardAnnouncements } from '@/components/dashboard/dashboard-announcements';
import { DashboardEsignPending } from '@/components/dashboard/dashboard-esign-pending';
import { ClaimRootBanner } from '@/components/dashboard/ClaimRootBanner';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { ComplianceActivityFeed } from '@/components/compliance/compliance-activity-feed';
import { StatusHero } from '@/components/dashboard/overview/status-hero';
import { AttentionQueueList } from '@/components/dashboard/overview/attention-queue-list';
import { WeekAgendaList } from '@/components/dashboard/overview/week-agenda-list';
import { QuickActions } from '@/components/dashboard/overview/quick-actions';
import { MetricStrip } from '@/components/dashboard/overview/metric-strip';
import { loadDashboardOverview } from '@/lib/dashboard/load-dashboard-overview';
import { buildAttentionQueue, countByTier } from '@/lib/dashboard/attention-queue';
import { buildStatusSentence, resolveDashboardAudience } from '@/lib/dashboard/status-sentence';
import { buildWeekAgenda } from '@/lib/dashboard/week-agenda';
import { buildMetricTiles, buildQuickActions } from '@/lib/dashboard/quick-actions';
import { buildComplianceSummary } from '@/lib/utils/compliance-calculator';
import { formatDeadlineStamp } from '@/lib/meetings/meeting-status';
import { resolveTimezone } from '@/lib/utils/timezone';

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-48 w-full rounded-md" />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Skeleton className="h-80 w-full rounded-md" />
        <Skeleton className="h-80 w-full rounded-md" />
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-24 w-full rounded-md" />
        <Skeleton className="h-24 w-full rounded-md" />
        <Skeleton className="h-24 w-full rounded-md" />
      </div>
    </div>
  );
}

/** Statuses the old violations card counted as open. */
const OPEN_VIOLATION_STATUSES = ['reported', 'noticed', 'hearing_scheduled', 'fined'] as const;

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([
    searchParams,
    headers(),
  ]);
  const context = resolvePageCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    headers: requestHeaders,
  });

  const userId = await requireAuthenticatedUserId();

  if (!context.communityId) {
    // Multi-community users see the unified overview; single-community
    // users use the community picker.
    const communityIds = await getAuthorizedCommunityIds(userId, getSupportScope(requestHeaders));
    if (communityIds.length >= 2) {
      redirect('/dashboard/overview');
    }
    redirect('/select-community');
  }
  const membership = await requireCommunityMembership(context.communityId, userId);

  // Redirect apartment communities to specialized dashboard [P2-38]. The one
  // type-based check on this page: every gate below reads effective features (D4).
  if (getFeaturesForCommunity(membership.communityType).hasLeaseTracking) {
    redirect(`/dashboard/apartment?communityId=${context.communityId}`);
  }
  const features = getEffectiveFeatures(
    membership.communityType,
    resolvePlanId(membership.subscriptionPlan),
  );
  const supportSession = getSupportScope(requestHeaders) !== null;

  const canWriteAnnouncements = checkPermissionV2(
    membership.role,
    membership.communityType,
    'announcements',
    'write',
    {
      isUnitOwner: membership.isUnitOwner,
    },
  );

  const celebrationNextStep = celebrationNextStepFor({
    communityId: context.communityId,
    role: membership.role,
    communityType: membership.communityType,
    isUnitOwner: membership.isUnitOwner,
  });

  // Start the heavy loads WITHOUT awaiting — they resolve inside the
  // Suspense boundary below, so the shell + skeleton flush to the browser
  // immediately and the panels stream in when the data arrives.
  const now = new Date();
  const timeZone = resolveTimezone(membership.timezone);
  const dataPromise = loadDashboardData(context.communityId, userId, membership);
  const overviewPromise = loadDashboardOverview({
    communityId: context.communityId,
    userId,
    membership,
    features,
    timeZone,
    now,
  });
  // Null unless a manager's website setup is not done (D18); resolves with the page.
  const websiteCardPromise = loadWebsiteLiveCard(context.communityId, membership.role, features);

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        {/* Outside the Suspense boundary: the page names itself for the
            breadcrumb leaf and assistive tech before the panels stream in, and
            as the first child it collects no space-y margin above it. */}
        <PageHeader title="Dashboard" />
        <ClaimRootBanner isAdmin={membership.isAdmin} />
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardPanels
            dataPromise={dataPromise}
            overviewPromise={overviewPromise}
            websiteCardPromise={websiteCardPromise}
            communityId={context.communityId}
            userId={userId}
            celebrationNextStep={celebrationNextStep}
            membership={membership}
            features={features}
            now={now}
            timeZone={timeZone}
            supportSession={supportSession}
            canWriteAnnouncements={canWriteAnnouncements}
            canReadActivity={checkPermissionV2(
              membership.role,
              membership.communityType,
              'audit',
              'read',
              { isUnitOwner: membership.isUnitOwner },
            )}
          />
        </Suspense>
      </div>
    </ErrorBoundary>
  );
}

interface DashboardPanelsProps {
  dataPromise: ReturnType<typeof loadDashboardData>;
  overviewPromise: ReturnType<typeof loadDashboardOverview>;
  websiteCardPromise: ReturnType<typeof loadWebsiteLiveCard>;
  communityId: number;
  userId: string;
  celebrationNextStep: CelebrationNextStep | null;
  membership: Awaited<ReturnType<typeof requireCommunityMembership>>;
  /** Effective features (D4): the plan, not just the community type. */
  features: CommunityFeatures;
  now: Date;
  timeZone: string;
  /** Support sessions are read-only: write actions are dropped (D17). */
  supportSession: boolean;
  canWriteAnnouncements: boolean;
  canReadActivity: boolean;
}

async function DashboardPanels({
  dataPromise,
  overviewPromise,
  websiteCardPromise,
  communityId,
  userId,
  celebrationNextStep,
  membership,
  features,
  now,
  timeZone,
  supportSession,
  canWriteAnnouncements,
  canReadActivity,
}: DashboardPanelsProps) {
  const [data, overview, websiteCard] = await Promise.all([
    dataPromise,
    overviewPromise,
    websiteCardPromise,
  ]);

  const audience = resolveDashboardAudience(membership);
  const checklist = overview.checklist?.ok ? overview.checklist.value : null;
  const meetings30d = overview.meetings30d.ok ? overview.meetings30d.value : [];
  const hearings = overview.hearings?.ok ? overview.hearings.value : null;
  // A failed source renders the queue's banner; the rest still renders (D21).
  const sourceFailed = [overview.checklist, overview.meetings30d, overview.hearings].some(
    (source) => source !== null && !source.ok,
  );

  const attention =
    audience === 'resident'
      ? null
      : buildAttentionQueue({
          audience,
          communityId,
          communityType: membership.communityType,
          designation: membership.designation,
          checklist,
          meetings30d,
          hearings,
          now,
          timeZone,
        });
  const tiers = countByTier(attention ?? []);
  // The e-sign card gates on effective features too: a plan without e-sign shows none.
  const pendingSigners = features.hasEsign ? data.pendingSigners : [];
  const nextMeeting = meetings30d.find((m) => new Date(m.startsAt).getTime() >= now.getTime());
  const nextMeetingSummary = nextMeeting
    ? { title: nextMeeting.title, startsAt: new Date(nextMeeting.startsAt).toISOString() }
    : null;

  const sentence = buildStatusSentence({
    audience,
    criticalCount: tiers.critical,
    urgentCount: tiers.urgent,
    pendingSignatures: pendingSigners.length,
    readiness: checklist ? buildComplianceSummary(checklist, now).readiness : null,
    // undefined (read failed) omits the line; null says no meetings are scheduled.
    nextMeeting: overview.meetings30d.ok ? nextMeetingSummary : undefined,
    timeZone,
  });
  // Residents already read the next meeting in the sentence body.
  const facts =
    audience !== 'resident' && nextMeetingSummary
      ? [{ label: 'Next meeting', value: formatDeadlineStamp(nextMeetingSummary.startsAt, timeZone) }]
      : [];

  const violationOpenCount =
    features.hasViolations && data.violationSummary
      ? OPEN_VIOLATION_STATUSES.reduce((sum, status) => sum + (data.violationSummary?.byStatus[status] ?? 0), 0)
      : null;

  const today = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone,
  }).format(now);

  return (
    <div className="space-y-6">
      {websiteCard ? (
        <WebsiteLiveCard
          communityId={communityId}
          communityName={data.communityName}
          publicUrl={websiteCard.publicUrl}
        />
      ) : null}
      <OnboardingChecklist
        communityId={communityId}
        communityName={data.communityName}
        userId={userId}
        nextStep={celebrationNextStep}
        variant={websiteCard ? 'secondary' : 'primary'}
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-content-secondary">{today}</p>
          <h2 className="mt-1 text-2xl font-semibold text-content">Welcome, {data.firstName}</h2>
        </div>
        {audience === 'manager' && !supportSession ? (
          <Button asChild>
            <Link href={`/documents?communityId=${communityId}`}>Upload document</Link>
          </Button>
        ) : null}
      </div>
      <StatusHero sentence={sentence} facts={facts} />
      {/* Residents have no queue: This week takes the row alone. Two full literal class strings. */}
      <div className={attention === null ? 'grid gap-6' : 'grid gap-6 lg:grid-cols-[2fr_1fr]'}>
        <AttentionQueueList
          items={attention}
          communityId={communityId}
          error={audience !== 'resident' && sourceFailed}
        />
        <WeekAgendaList
          days={buildWeekAgenda({ meetings30d, attention: attention ?? [], hearings, now, timeZone })}
          error={!overview.meetings30d.ok}
        />
      </div>
      <QuickActions
        actions={buildQuickActions({
          audience,
          communityId,
          features,
          canWriteAnnouncements,
          pendingSignatures: pendingSigners.length,
          supportSession,
        })}
      />
      <MetricStrip
        tiles={buildMetricTiles({
          audience,
          features,
          violationOpenCount,
          openMaintenanceCount: data.openMaintenanceCount,
          meetings30d: overview.meetings30d.ok ? meetings30d : null,
          communityId,
          timeZone,
        })}
      />
      {pendingSigners.length > 0 ? <DashboardEsignPending items={pendingSigners} /> : null}
      <DashboardAnnouncements
        items={data.announcements}
        communityId={communityId}
        canWriteAnnouncements={canWriteAnnouncements}
      />
      {canReadActivity ? <ComplianceActivityFeed communityId={communityId} /> : null}
    </div>
  );
}
