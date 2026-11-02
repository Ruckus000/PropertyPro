/**
 * Quick actions and metric tiles (spec sections 5 and D17/D18). Pure. Every
 * feature gate reads EFFECTIVE features (D4); the caller passes them in.
 */
import type { CommunityFeatures } from '@propertypro/shared';
import type { DashboardAudience } from '@/lib/dashboard/attention-queue';
import type { CalendarMeetingRecord } from '@/lib/services/calendar-data-service';

export interface QuickAction {
  id: string;
  label: string;
  href: string;
  icon: 'megaphone' | 'file' | 'calendar' | 'pen' | 'wrench' | 'alert' | 'user';
}

const MAX_ACTIONS = 4;

export function buildQuickActions(input: {
  audience: DashboardAudience;
  communityId: number;
  features: CommunityFeatures;
  canWriteAnnouncements: boolean;
  pendingSignatures: number;
  supportSession: boolean;
}): QuickAction[] {
  const { audience, features, pendingSignatures, supportSession } = input;
  const cid = `?communityId=${input.communityId}`;

  const newAnnouncement: QuickAction = { id: 'new-announcement', label: 'New announcement', href: `/announcements/new${cid}`, icon: 'megaphone' };
  const uploadDocument: QuickAction = { id: 'upload-document', label: 'Upload document', href: `/documents${cid}`, icon: 'file' };
  const scheduleMeeting: QuickAction = { id: 'schedule-meeting', label: 'Schedule meeting', href: `/meetings${cid}`, icon: 'calendar' };
  const sign: QuickAction = {
    id: 'sign',
    label: `Sign ${pendingSignatures} ${pendingSignatures === 1 ? 'document' : 'documents'}`,
    href: '#documents-to-sign',
    icon: 'pen',
  };
  const askRepair: QuickAction = { id: 'ask-repair', label: 'Ask for a repair', href: `/maintenance/submit${cid}`, icon: 'wrench' };
  const findDocument: QuickAction = { id: 'find-document', label: 'Find a document', href: `/documents${cid}`, icon: 'file' };
  const reportProblem: QuickAction = { id: 'report-problem', label: 'Report a problem', href: `/violations/report${cid}`, icon: 'alert' };
  const updateContact: QuickAction = { id: 'update-contact', label: 'Update my contact info', href: `/settings/account${cid}`, icon: 'user' };

  // Each entry is [action, gate]; an action shows only when its gate passes.
  const plan: Array<[QuickAction, boolean]> =
    audience === 'manager'
      ? [
          [newAnnouncement, input.canWriteAnnouncements],
          [uploadDocument, true],
          [scheduleMeeting, features.hasMeetings],
          [sign, pendingSignatures > 0],
        ]
      : audience === 'board'
        ? [
            [findDocument, true],
            [reportProblem, features.hasViolations],
            [sign, pendingSignatures > 0],
            [updateContact, true],
          ]
        : [
            [askRepair, features.hasMaintenanceRequests],
            [findDocument, true],
            [reportProblem, features.hasViolations],
            [updateContact, true],
          ];

  // Support sessions are read-only (D17).
  const writes = new Set([newAnnouncement.id, uploadDocument.id, scheduleMeeting.id, askRepair.id, reportProblem.id]);
  return plan
    .filter(([action, gate]) => gate && !(supportSession && writes.has(action.id)))
    .map(([action]) => action)
    .slice(0, MAX_ACTIONS);
}

/** No subtitle: the shared KpiCard has no slot for one (R3). */
export interface MetricTileData {
  id: 'violations' | 'maintenance' | 'meetings';
  title: string;
  value: string;
  href: string;
}

export function buildMetricTiles(input: {
  audience: DashboardAudience;
  features: CommunityFeatures;
  violationOpenCount: number | null;
  openMaintenanceCount: number;
  /** null: the read failed, so the meetings tile is omitted rather than shown as 0 (D21). */
  meetings30d: CalendarMeetingRecord[] | null;
  communityId: number;
  timeZone: string;
}): MetricTileData[] {
  const { audience, features } = input;
  const cid = `?communityId=${input.communityId}`;
  const tiles: MetricTileData[] = [];

  if (features.hasViolations && input.violationOpenCount !== null) {
    tiles.push({
      id: 'violations',
      title: 'Open violations',
      value: String(input.violationOpenCount),
      // The violations list admits board seats and managers only; residents report instead.
      href: audience === 'resident' ? `/violations/report${cid}` : `/violations${cid}`,
    });
  }
  // Community-wide count: managers and board seats only (D18).
  if (audience !== 'resident' && features.hasMaintenanceRequests) {
    tiles.push({
      id: 'maintenance',
      title: 'Open maintenance requests',
      value: String(input.openMaintenanceCount),
      href: `/maintenance${cid}`,
    });
  }
  if (input.meetings30d !== null) {
    tiles.push({
      id: 'meetings',
      title: 'Upcoming meetings',
      value: String(input.meetings30d.length),
      href: `/meetings${cid}`,
    });
  }
  return tiles;
}
