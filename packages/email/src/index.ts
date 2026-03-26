// Types
export type {
  CommunityBranding,
  BaseEmailProps,
  EmailCategory,
  SendEmailOptions,
  SendEmailResult,
} from "./types";

// Layout
export { EmailLayout } from "./components/email-layout";

// Templates
export { InvitationEmail } from "./templates/invitation-email";
export type { InvitationEmailProps } from "./templates/invitation-email";

export { PasswordResetEmail } from "./templates/password-reset-email";
export type { PasswordResetEmailProps } from "./templates/password-reset-email";

export { MeetingNoticeEmail } from "./templates/meeting-notice-email";
export type { MeetingNoticeEmailProps } from "./templates/meeting-notice-email";

export { ComplianceAlertEmail } from "./templates/compliance-alert-email";
export type { ComplianceAlertEmailProps } from "./templates/compliance-alert-email";

export { AnnouncementEmail } from "./templates/announcement-email";
export type { AnnouncementEmailProps } from "./templates/announcement-email";

export { MaintenanceUpdateEmail } from "./templates/maintenance-update-email";
export type { MaintenanceUpdateEmailProps } from "./templates/maintenance-update-email";

export { DocumentPostedEmail } from "./templates/document-posted-email";
export type { DocumentPostedEmailProps } from "./templates/document-posted-email";

export { NotificationDigestEmail } from "./templates/notification-digest-email";
export type {
  NotificationDigestEmailProps,
  NotificationDigestItem,
} from "./templates/notification-digest-email";

export { SignupVerificationEmail } from "./templates/signup-verification-email";
export type { SignupVerificationEmailProps } from "./templates/signup-verification-email";

export { PaymentFailedEmail } from "./templates/payment-failed";
export type { PaymentFailedEmailProps } from "./templates/payment-failed";

export { SubscriptionCanceledEmail } from "./templates/subscription-canceled";
export type { SubscriptionCanceledEmailProps } from "./templates/subscription-canceled";

export { SubscriptionExpiryWarningEmail } from "./templates/subscription-expiry-warning";
export type { SubscriptionExpiryWarningEmailProps } from "./templates/subscription-expiry-warning";

export { WelcomeEmail } from "./templates/welcome-email";
export type { WelcomeEmailProps } from "./templates/welcome-email";

export { EmergencyAlertEmail } from "./templates/emergency-alert-email";
export type { EmergencyAlertEmailProps, EmergencyAlertSeverity } from "./templates/emergency-alert-email";

export { AssessmentPaymentReceivedEmail } from "./templates/assessment-payment-received";
export type { AssessmentPaymentReceivedEmailProps } from "./templates/assessment-payment-received";

export { AssessmentDueReminderEmail } from "./templates/assessment-due-reminder";
export type { AssessmentDueReminderEmailProps } from "./templates/assessment-due-reminder";

export { EsignInvitationEmail } from "./templates/esign-invitation-email";
export type { EsignInvitationEmailProps } from "./templates/esign-invitation-email";

export { EsignCompletedEmail } from "./templates/esign-completed-email";
export type { EsignCompletedEmailProps } from "./templates/esign-completed-email";

export { EsignReminderEmail } from "./templates/esign-reminder-email";
export type { EsignReminderEmailProps } from "./templates/esign-reminder-email";

export { OtpVerificationEmail } from "./templates/otp-verification";
export type { OtpVerificationEmailProps } from "./templates/otp-verification";

export { AccessRequestPendingEmail } from "./templates/access-request-pending";
export type { AccessRequestPendingEmailProps } from "./templates/access-request-pending";

export { AccessRequestApprovedEmail } from "./templates/access-request-approved";
export type { AccessRequestApprovedEmailProps } from "./templates/access-request-approved";

export { AccessRequestDeniedEmail } from "./templates/access-request-denied";
export type { AccessRequestDeniedEmailProps } from "./templates/access-request-denied";

export { FreeAccessExpiringEmail } from "./templates/free-access-expiring-email";
export type { FreeAccessExpiringEmailProps } from "./templates/free-access-expiring-email";

export { FreeAccessExpiredEmail } from "./templates/free-access-expired-email";
export type { FreeAccessExpiredEmailProps } from "./templates/free-access-expired-email";

export { AccountDeletionInitiatedEmail } from "./templates/account-deletion-initiated-email";
export type { AccountDeletionInitiatedEmailProps } from "./templates/account-deletion-initiated-email";

export { AccountDeletionExecutedEmail } from "./templates/account-deletion-executed-email";
export type { AccountDeletionExecutedEmailProps } from "./templates/account-deletion-executed-email";

export { AccountRecoveredEmail } from "./templates/account-recovered-email";
export type { AccountRecoveredEmailProps } from "./templates/account-recovered-email";

// Shared components (v2 redesign)
export { EmailButton } from "./components/email-button";
export { EmailCard } from "./components/email-card";
export { EmailAlert } from "./components/email-alert";
export * as emailStyles from "./components/shared-styles";

// Send helper
export { sendEmail, testInbox, clearTestInbox } from "./send";
export type { TestMessage } from "./send";
