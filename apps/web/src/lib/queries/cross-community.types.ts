/**
 * Shared types for the cross-community overview feature.
 */

export type CommunityType = 'condo_718' | 'hoa_720' | 'apartment';

export interface CommunityCard {
  communityId: number;
  communityName: string;
  communitySlug: string;
  communityType: CommunityType;
  complianceScore: number | null;
  urgentItemCount: number;
  criticalItemCount: number;
}

export type ActivityType = 'document' | 'announcement' | 'meeting_minutes' | 'violation';

export interface ActivityItem {
  id: string;
  communityId: number;
  communityName: string;
  communitySlug: string;
  type: ActivityType;
  title: string;
  occurredAt: string;
  link: string;
}

export type UpcomingEventType = 'meeting' | 'vote' | 'esign_due' | 'inspection';

export interface UpcomingEvent {
  id: string;
  communityId: number;
  communityName: string;
  communitySlug: string;
  type: UpcomingEventType;
  title: string;
  scheduledFor: string;
  link: string;
}

export interface OverviewPayload {
  cards: CommunityCard[];
  activity: ActivityItem[];
  events: UpcomingEvent[];
}
