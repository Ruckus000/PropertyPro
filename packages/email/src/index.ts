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

// Send helper
export { sendEmail, testInbox, clearTestInbox } from "./send";
export type { TestMessage } from "./send";
