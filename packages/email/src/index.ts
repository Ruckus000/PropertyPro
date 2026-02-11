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

// Send helper
export { sendEmail, testInbox, clearTestInbox } from "./send";
export type { TestMessage } from "./send";
