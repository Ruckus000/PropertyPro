/**
 * Schema barrel export — all tables, enums, and inferred types.
 */
export * from './enums';
export * from './communities';
export * from './users';
export * from './user-roles';
export * from './units';
export * from './document-categories';
export * from './documents';
export * from './announcements';
export * from './announcement-delivery-log';
export * from './notification-digest-queue';
export * from './notification-preferences';
export * from './pending-signups';
export * from './stripe-webhook-events';
export * from './provisioning-jobs';
export * from './compliance-audit-log';
export * from './compliance-checklist-items';
export * from './invitations';
export * from './meetings';
export * from './meeting-documents';
export * from './leases';
export * from './maintenance-requests';
export * from './maintenance-comments';
export * from './contracts';
export * from './contract-bids';
export * from './demo-seed-registry';
export * from './onboarding-wizard-state';
export * from './rls-config';

// ---------------------------------------------------------------------------
// Inferred TypeScript types via Drizzle $inferSelect / $inferInsert
// ---------------------------------------------------------------------------
import type { communities } from './communities';
import type { users } from './users';
import type { userRoles } from './user-roles';
import type { units } from './units';
import type { documentCategories } from './document-categories';
import type { documents } from './documents';
import type { announcements } from './announcements';
import type { announcementDeliveryLog } from './announcement-delivery-log';
import type { notificationDigestQueue } from './notification-digest-queue';
import type { notificationPreferences } from './notification-preferences';
import type { pendingSignups } from './pending-signups';
import type { stripeWebhookEvents } from './stripe-webhook-events';
import type { provisioningJobs } from './provisioning-jobs';
import type { complianceAuditLog } from './compliance-audit-log';
import type { complianceChecklistItems } from './compliance-checklist-items';
import type { invitations } from './invitations';
import type { meetings } from './meetings';
import type { meetingDocuments } from './meeting-documents';
import type { leases } from './leases';
import type { maintenanceRequests } from './maintenance-requests';
import type { maintenanceComments } from './maintenance-comments';
import type { contracts } from './contracts';
import type { contractBids } from './contract-bids';
import type { demoSeedRegistry } from './demo-seed-registry';
import type { onboardingWizardState } from './onboarding-wizard-state';

// Communities
export type Community = typeof communities.$inferSelect;
export type NewCommunity = typeof communities.$inferInsert;

// Users
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// User Roles
export type UserRoleRecord = typeof userRoles.$inferSelect;
export type NewUserRoleRecord = typeof userRoles.$inferInsert;

// Units
export type Unit = typeof units.$inferSelect;
export type NewUnit = typeof units.$inferInsert;

// Document Categories
export type DocumentCategory = typeof documentCategories.$inferSelect;
export type NewDocumentCategory = typeof documentCategories.$inferInsert;

// Documents
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;

// Announcements
export type Announcement = typeof announcements.$inferSelect;
export type NewAnnouncement = typeof announcements.$inferInsert;

// Announcement Delivery Log
export type AnnouncementDeliveryLog = typeof announcementDeliveryLog.$inferSelect;
export type NewAnnouncementDeliveryLog = typeof announcementDeliveryLog.$inferInsert;

// Notification Digest Queue
export type NotificationDigestQueue = typeof notificationDigestQueue.$inferSelect;
export type NewNotificationDigestQueue = typeof notificationDigestQueue.$inferInsert;

// Notification Preferences
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert;

// Pending Signups
export type PendingSignup = typeof pendingSignups.$inferSelect;
export type NewPendingSignup = typeof pendingSignups.$inferInsert;

// Stripe Webhook Events
export type StripeWebhookEvent = typeof stripeWebhookEvents.$inferSelect;
export type NewStripeWebhookEvent = typeof stripeWebhookEvents.$inferInsert;

// Provisioning Jobs
export type ProvisioningJob = typeof provisioningJobs.$inferSelect;
export type NewProvisioningJob = typeof provisioningJobs.$inferInsert;

// Compliance Audit Log (append-only — no Insert type needed, use logAuditEvent())
export type ComplianceAuditLogRecord = typeof complianceAuditLog.$inferSelect;

// Compliance Checklist Items
export type ComplianceChecklistItem = typeof complianceChecklistItems.$inferSelect;
export type NewComplianceChecklistItem = typeof complianceChecklistItems.$inferInsert;

// Invitations
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;

// Meetings
export type Meeting = typeof meetings.$inferSelect;
export type NewMeeting = typeof meetings.$inferInsert;

// Meeting Documents
export type MeetingDocument = typeof meetingDocuments.$inferSelect;
export type NewMeetingDocument = typeof meetingDocuments.$inferInsert;

// Leases
export type Lease = typeof leases.$inferSelect;
export type NewLease = typeof leases.$inferInsert;

// Maintenance Requests
export type MaintenanceRequest = typeof maintenanceRequests.$inferSelect;
export type NewMaintenanceRequest = typeof maintenanceRequests.$inferInsert;

// Maintenance Comments (append-only — no NewMaintenanceComment Insert type)
export type MaintenanceComment = typeof maintenanceComments.$inferSelect;

// Demo Seed Registry
export type DemoSeedRegistryRecord = typeof demoSeedRegistry.$inferSelect;
export type NewDemoSeedRegistryRecord = typeof demoSeedRegistry.$inferInsert;

// Contracts (P3-52)
export type Contract = typeof contracts.$inferSelect;
export type NewContract = typeof contracts.$inferInsert;

// Contract Bids (P3-52)
export type ContractBid = typeof contractBids.$inferSelect;
export type NewContractBid = typeof contractBids.$inferInsert;

// Onboarding Wizard State
export type OnboardingWizardState = typeof onboardingWizardState.$inferSelect;
export type NewOnboardingWizardState = typeof onboardingWizardState.$inferInsert;
