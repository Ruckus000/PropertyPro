// Types
export type {
  CommunityBranding,
  BaseEmailProps,
  EmailCategory,
  SendEmailOptions,
  SendEmailResult,
  SendBulkEmailResult,
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

export { SnowbirdDigestEmail } from "./templates/snowbird-digest-email";
export type {
  SnowbirdDigestEmailProps,
  SnowbirdDigestItem,
} from "./templates/snowbird-digest-email";

export { CertificateRequestEmail } from "./templates/certificate-request-email";
export type { CertificateRequestEmailProps } from "./templates/certificate-request-email";

export { InsuranceAlertEmail } from "./templates/insurance-alert-email";
export type { InsuranceAlertEmailProps } from "./templates/insurance-alert-email";

export { SignupVerificationEmail } from "./templates/signup-verification-email";
export type { SignupVerificationEmailProps } from "./templates/signup-verification-email";

export { PaymentFailedEmail } from "./templates/payment-failed";
export type { PaymentFailedEmailProps } from "./templates/payment-failed";

export { AuthenticateCardEmail } from "./templates/authenticate-card";
export type { AuthenticateCardEmailProps } from "./templates/authenticate-card";

export { SubscriptionCanceledEmail } from "./templates/subscription-canceled";
export type { SubscriptionCanceledEmailProps } from "./templates/subscription-canceled";

export { SubscriptionExpiryWarningEmail } from "./templates/subscription-expiry-warning";
export type { SubscriptionExpiryWarningEmailProps } from "./templates/subscription-expiry-warning";

export { SubscriptionLapsedEmail } from "./templates/subscription-lapsed";
export type { SubscriptionLapsedEmailProps } from "./templates/subscription-lapsed";

export { WelcomeEmail } from "./templates/welcome-email";
export type { WelcomeEmailProps } from "./templates/welcome-email";

export { EmergencyAlertEmail } from "./templates/emergency-alert-email";
export type { EmergencyAlertEmailProps, EmergencyAlertSeverity } from "./templates/emergency-alert-email";

export { AssessmentPaymentReceivedEmail } from "./templates/assessment-payment-received";
export type { AssessmentPaymentReceivedEmailProps } from "./templates/assessment-payment-received";

export { AssessmentDueReminderEmail } from "./templates/assessment-due-reminder";
export type { AssessmentDueReminderEmailProps } from "./templates/assessment-due-reminder";

export { CalendarEventReminderEmail } from "./templates/calendar-event-reminder-email";
export type { CalendarEventReminderEmailProps } from "./templates/calendar-event-reminder-email";

export { RootClaimedEmail } from "./templates/root-claimed-email";
export type { RootClaimedEmailProps } from "./templates/root-claimed-email";

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

export { CommunityExportReadyEmail } from "./templates/community-export-ready-email";
export type { CommunityExportReadyEmailProps } from "./templates/community-export-ready-email";

// Shared components (v2 redesign)
export { EmailButton } from "./components/email-button";
export { EmailCard } from "./components/email-card";
export { EmailAlert } from "./components/email-alert";
export * as emailStyles from "./components/shared-styles";

// Send helper
export { sendEmail, sendBulkEmail, testInbox, clearTestInbox } from "./send";
export type { TestMessage } from "./send";

// Delivery mode. Exported so the deployment-readiness probe can report on it:
// an unset RESEND_API_KEY makes every send a silent no-op, which is exactly the
// class of failure readiness exists to surface. Callers must use this rather
// than reading the env vars themselves — it encodes the EMAIL_DRY_RUN > key
// precedence and the truthiness rules ('0'/'false'/'no' are falsy).
export { resolveDeliveryMode } from "./send";
export type { DeliveryMode } from "./send";
