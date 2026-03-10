import type { NotificationEvent, RecipientFilter } from '@/lib/services/notification-service';
import type { AnnouncementAudience } from '@/lib/services/announcement-delivery';

export interface CapturedNotification {
  communityId: number;
  event: NotificationEvent;
  recipientFilter: RecipientFilter;
  actorUserId?: string;
}

export interface CapturedAnnouncementDelivery {
  communityId: number;
  announcementId: number;
  audience: AnnouncementAudience;
  title: string;
  body: string;
  isPinned: boolean;
  authorName: string;
}

const notificationSink: CapturedNotification[] = [];
const announcementSink: CapturedAnnouncementDelivery[] = [];

export function captureNotification(entry: CapturedNotification): void {
  notificationSink.push(entry);
}

export function captureAnnouncementDelivery(entry: CapturedAnnouncementDelivery): void {
  announcementSink.push(entry);
}

export function getCapturedNotifications(): readonly CapturedNotification[] {
  return notificationSink;
}

export function getCapturedAnnouncementDeliveries(): readonly CapturedAnnouncementDelivery[] {
  return announcementSink;
}

export function clearCapturedNotifications(): void {
  notificationSink.length = 0;
}

export function clearCapturedAnnouncementDeliveries(): void {
  announcementSink.length = 0;
}
