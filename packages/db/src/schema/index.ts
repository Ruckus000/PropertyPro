/**
 * Schema barrel export — all tables, enums, and inferred types.
 */
export * from './access-requests';
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
export * from './platform-admin-users';
export * from './stripe-webhook-events';
export * from './assessments';
export * from './assessment-line-items';
export * from './rent-obligations';
export * from './rent-payments';
export * from './stripe-connected-accounts';
export * from './finance-stripe-webhook-events';
export * from './calendar-sync-tokens';
export * from './accounting-connections';
export * from './violations';
export * from './violation-fines';
export * from './arc-submissions';
export * from './polls';
export * from './poll-votes';
export * from './forum-threads';
export * from './forum-replies';
export * from './vendors';
export * from './work-orders';
export * from './amenities';
export * from './amenity-reservations';
export * from './package-log';
export * from './visitor-log';
export * from './denied-visitors';
export * from './provisioning-jobs';
export * from './compliance-audit-log';
export * from './compliance-checklist-items';
export * from './invitations';
export * from './meetings';
export * from './meeting-documents';
export * from './leases';
export * from './move-checklists';
export * from './maintenance-requests';
export * from './maintenance-comments';
export * from './contracts';
export * from './contract-bids';
export * from './ledger-entries';
export * from './demo-seed-registry';
export * from './demo-instances';
export * from './onboarding-wizard-state';
export * from './rls-config';
export * from './site-blocks';
export * from './esign';
export * from './emergency-broadcasts';
export * from './emergency-broadcast-recipients';
export * from './elections';
export * from './faqs';
export * from './stripe-prices';
export * from './conversion-events';
export * from './public-site-templates';

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
import type { assessments } from './assessments';
import type { assessmentLineItems } from './assessment-line-items';
import type { rentObligations } from './rent-obligations';
import type { rentPayments } from './rent-payments';
import type { stripeConnectedAccounts } from './stripe-connected-accounts';
import type { financeStripeWebhookEvents } from './finance-stripe-webhook-events';
import type { calendarSyncTokens } from './calendar-sync-tokens';
import type { accountingConnections } from './accounting-connections';
import type { violations } from './violations';
import type { violationFines } from './violation-fines';
import type { arcSubmissions } from './arc-submissions';
import type { polls } from './polls';
import type { pollVotes } from './poll-votes';
import type { forumThreads } from './forum-threads';
import type { forumReplies } from './forum-replies';
import type { vendors } from './vendors';
import type { workOrders } from './work-orders';
import type { amenities } from './amenities';
import type { amenityReservations } from './amenity-reservations';
import type { packageLog } from './package-log';
import type { visitorLog } from './visitor-log';
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
import type { ledgerEntries } from './ledger-entries';
import type { demoSeedRegistry } from './demo-seed-registry';
import type { demoInstances } from './demo-instances';
import type { onboardingWizardState } from './onboarding-wizard-state';
import type { platformAdminUsers } from './platform-admin-users';
import type { siteBlocks } from './site-blocks';

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

// Assessments
export type Assessment = typeof assessments.$inferSelect;
export type NewAssessment = typeof assessments.$inferInsert;

// Assessment Line Items
export type AssessmentLineItem = typeof assessmentLineItems.$inferSelect;
export type NewAssessmentLineItem = typeof assessmentLineItems.$inferInsert;

// Rent Obligations
export type RentObligation = typeof rentObligations.$inferSelect;
export type NewRentObligation = typeof rentObligations.$inferInsert;

// Rent Payments
export type RentPayment = typeof rentPayments.$inferSelect;
export type NewRentPayment = typeof rentPayments.$inferInsert;

// Stripe Connected Accounts
export type StripeConnectedAccount = typeof stripeConnectedAccounts.$inferSelect;
export type NewStripeConnectedAccount = typeof stripeConnectedAccounts.$inferInsert;

// Finance Stripe Webhook Events
export type FinanceStripeWebhookEvent = typeof financeStripeWebhookEvents.$inferSelect;
export type NewFinanceStripeWebhookEvent = typeof financeStripeWebhookEvents.$inferInsert;

// Calendar Sync Tokens
export type CalendarSyncToken = typeof calendarSyncTokens.$inferSelect;
export type NewCalendarSyncToken = typeof calendarSyncTokens.$inferInsert;

// Accounting Connections
export type AccountingConnection = typeof accountingConnections.$inferSelect;
export type NewAccountingConnection = typeof accountingConnections.$inferInsert;

// Violations
export type Violation = typeof violations.$inferSelect;
export type NewViolation = typeof violations.$inferInsert;

// Violation Fines
export type ViolationFine = typeof violationFines.$inferSelect;
export type NewViolationFine = typeof violationFines.$inferInsert;

// ARC Submissions
export type ArcSubmission = typeof arcSubmissions.$inferSelect;
export type NewArcSubmission = typeof arcSubmissions.$inferInsert;

// Polls
export type Poll = typeof polls.$inferSelect;
export type NewPoll = typeof polls.$inferInsert;

// Poll Votes
export type PollVote = typeof pollVotes.$inferSelect;
export type NewPollVote = typeof pollVotes.$inferInsert;

// Forum Threads
export type ForumThread = typeof forumThreads.$inferSelect;
export type NewForumThread = typeof forumThreads.$inferInsert;

// Forum Replies
export type ForumReply = typeof forumReplies.$inferSelect;
export type NewForumReply = typeof forumReplies.$inferInsert;

// Vendors
export type Vendor = typeof vendors.$inferSelect;
export type NewVendor = typeof vendors.$inferInsert;

// Work Orders
export type WorkOrder = typeof workOrders.$inferSelect;
export type NewWorkOrder = typeof workOrders.$inferInsert;

// Amenities
export type Amenity = typeof amenities.$inferSelect;
export type NewAmenity = typeof amenities.$inferInsert;

// Amenity Reservations
export type AmenityReservation = typeof amenityReservations.$inferSelect;
export type NewAmenityReservation = typeof amenityReservations.$inferInsert;

// Package Log
export type PackageLog = typeof packageLog.$inferSelect;
export type NewPackageLog = typeof packageLog.$inferInsert;

// Visitor Log
export type VisitorLog = typeof visitorLog.$inferSelect;
export type NewVisitorLog = typeof visitorLog.$inferInsert;

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

// Demo Instances
export type DemoInstance = typeof demoInstances.$inferSelect;
export type NewDemoInstance = typeof demoInstances.$inferInsert;

// Contracts (P3-52)
export type Contract = typeof contracts.$inferSelect;
export type NewContract = typeof contracts.$inferInsert;

// Contract Bids (P3-52)
export type ContractBid = typeof contractBids.$inferSelect;
export type NewContractBid = typeof contractBids.$inferInsert;

// Ledger Entries
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type NewLedgerEntry = typeof ledgerEntries.$inferInsert;

// Onboarding Wizard State
export type OnboardingWizardState = typeof onboardingWizardState.$inferSelect;
export type NewOnboardingWizardState = typeof onboardingWizardState.$inferInsert;

// Platform Admin Users
export type PlatformAdminUser = typeof platformAdminUsers.$inferSelect;
export type NewPlatformAdminUser = typeof platformAdminUsers.$inferInsert;

// Site Blocks
export type SiteBlock = typeof siteBlocks.$inferSelect;
export type NewSiteBlock = typeof siteBlocks.$inferInsert;

// E-Signature Templates
import type { esignTemplates } from './esign';
export type EsignTemplate = typeof esignTemplates.$inferSelect;
export type NewEsignTemplate = typeof esignTemplates.$inferInsert;

// E-Signature Submissions
import type { esignSubmissions } from './esign';
export type EsignSubmission = typeof esignSubmissions.$inferSelect;
export type NewEsignSubmission = typeof esignSubmissions.$inferInsert;

// E-Signature Signers
import type { esignSigners } from './esign';
export type EsignSigner = typeof esignSigners.$inferSelect;
export type NewEsignSigner = typeof esignSigners.$inferInsert;

// E-Signature Events (append-only)
import type { esignEvents } from './esign';
export type EsignEvent = typeof esignEvents.$inferSelect;

// E-Signature Consent
import type { esignConsent } from './esign';
export type EsignConsentRecord = typeof esignConsent.$inferSelect;
export type NewEsignConsentRecord = typeof esignConsent.$inferInsert;

// Emergency Broadcasts (Phase 1B)
import type { emergencyBroadcasts } from './emergency-broadcasts';
export type EmergencyBroadcast = typeof emergencyBroadcasts.$inferSelect;
export type NewEmergencyBroadcast = typeof emergencyBroadcasts.$inferInsert;

// Emergency Broadcast Recipients (Phase 1B)
import type { emergencyBroadcastRecipients } from './emergency-broadcast-recipients';
export type EmergencyBroadcastRecipient = typeof emergencyBroadcastRecipients.$inferSelect;
export type NewEmergencyBroadcastRecipient = typeof emergencyBroadcastRecipients.$inferInsert;

// Move Checklists (Phase 2C)
import type { moveChecklists } from './move-checklists';
export type MoveChecklist = typeof moveChecklists.$inferSelect;
export type NewMoveChecklist = typeof moveChecklists.$inferInsert;

// Elections (Phase 1D)
import type {
  elections,
  electionCandidates,
  electionBallotSubmissions,
  electionBallots,
  electionProxies,
  electionEligibilitySnapshots,
} from './elections';
export type Election = typeof elections.$inferSelect;
export type NewElection = typeof elections.$inferInsert;
export type ElectionCandidate = typeof electionCandidates.$inferSelect;
export type NewElectionCandidate = typeof electionCandidates.$inferInsert;
export type ElectionBallotSubmission = typeof electionBallotSubmissions.$inferSelect;
export type NewElectionBallotSubmission = typeof electionBallotSubmissions.$inferInsert;
export type ElectionBallot = typeof electionBallots.$inferSelect;
export type NewElectionBallot = typeof electionBallots.$inferInsert;
export type ElectionProxy = typeof electionProxies.$inferSelect;
export type NewElectionProxy = typeof electionProxies.$inferInsert;
export type ElectionEligibilitySnapshot = typeof electionEligibilitySnapshots.$inferSelect;
export type NewElectionEligibilitySnapshot = typeof electionEligibilitySnapshots.$inferInsert;

// FAQs
import type { faqs } from './faqs';
export type Faq = typeof faqs.$inferSelect;
export type NewFaq = typeof faqs.$inferInsert;

// Denied Visitors
import type { deniedVisitors } from './denied-visitors';
export type DeniedVisitor = typeof deniedVisitors.$inferSelect;
export type NewDeniedVisitor = typeof deniedVisitors.$inferInsert;

// Access Requests (self-service resident signup)
import type { accessRequests } from './access-requests';
export type AccessRequest = typeof accessRequests.$inferSelect;
export type NewAccessRequest = typeof accessRequests.$inferInsert;

// Account Lifecycle
export { accessPlans } from './access-plans';
export { accountDeletionRequests } from './account-deletion-requests';

import type { accessPlans as _accessPlans } from './access-plans';
export type AccessPlan = typeof _accessPlans.$inferSelect;
export type NewAccessPlan = typeof _accessPlans.$inferInsert;

import type { accountDeletionRequests as _accountDeletionRequests } from './account-deletion-requests';
export type AccountDeletionRequest = typeof _accountDeletionRequests.$inferSelect;
export type NewAccountDeletionRequest = typeof _accountDeletionRequests.$inferInsert;

// Stripe Prices (global billing config)
import type { stripePrices } from './stripe-prices';
export type StripePrice = typeof stripePrices.$inferSelect;
export type NewStripePrice = typeof stripePrices.$inferInsert;

// Conversion Events (append-only analytics)
import type { conversionEvents } from './conversion-events';
export type ConversionEvent = typeof conversionEvents.$inferSelect;
export type NewConversionEvent = typeof conversionEvents.$inferInsert;

// Support access
export { supportSessions, type SupportSession, type NewSupportSession } from './support-sessions';
export { supportConsentGrants, type SupportConsentGrant, type NewSupportConsentGrant } from './support-consent-grants';
export { supportAccessLog, type SupportAccessLogEntry, type NewSupportAccessLogEntry } from './support-access-log';
export { supportAccessLevelEnum } from './enums';
