/**
 * One render fixture per template file in src/templates/ — keyed by FILENAME
 * so the coverage test can prove the set is complete by reading the directory.
 *
 * `minimal` passes only required props (the shape most call sites use today).
 * `rich` additionally fills every optional slot, which is the worst case for
 * the Gmail size budget and what the visual review renders.
 */
import type { ReactElement } from 'react';
import * as E from '../../src/index';
import type { CommunityBranding } from '../../src/index';

export const association: CommunityBranding = { communityName: 'Sunset Palms HOA' };

export const bulk: CommunityBranding = {
  communityName: 'Sunset Palms HOA',
  postalAddressLines: ['1400 Gulf Shore Blvd N, Suite 210', 'Naples, FL 34102'],
  unsubscribeUrl: 'https://example.com/api/v1/notifications/unsubscribe?token=abc',
  unsubscribeLabel: 'Unsubscribe from these emails',
  preferencesUrl: 'https://example.com/settings/notifications',
};

export type Accent = 'coral' | 'amber' | 'red' | 'green' | 'teal' | 'violet' | 'neutral' | 'none';

export interface TemplateFixture {
  /** Expected accent-rule tone (layout map in the Florida Modern plan). */
  accent: Accent;
  sender: 'association' | 'platform' | 'standalone';
  minimal: () => ReactElement;
  rich: () => ReactElement;
}

const url = (path: string) => `https://example.com/${path}`;

export const FIXTURES: Record<string, TemplateFixture> = {
  // ── Association ──────────────────────────────────────────────────────────
  'welcome-email': {
    accent: 'coral',
    sender: 'association',
    minimal: () => <E.WelcomeEmail branding={association} primaryContactName="Marisol Reyes" communityName="Sunset Palms HOA" loginUrl={url('login')} />,
    rich: () => <E.WelcomeEmail branding={association} primaryContactName="Marisol Reyes" communityName="Sunset Palms HOA" loginUrl={url('login')} />,
  },
  'invitation-email': {
    accent: 'coral',
    sender: 'association',
    minimal: () => <E.InvitationEmail branding={association} inviteeName="Marisol Reyes" inviterName="Dana Ruiz" role="Owner" inviteUrl={url('invite/abc')} />,
    rich: () => <E.InvitationEmail branding={association} inviteeName="Marisol Reyes" inviterName="Dana Ruiz" role="Owner" inviteUrl={url('invite/abc')} expiresInDays={7} />,
  },
  'announcement-email': {
    accent: 'coral',
    sender: 'association',
    minimal: () => (
      <E.AnnouncementEmail branding={association} recipientName="Marisol" announcementTitle="Pool deck resurfacing begins October 6" announcementBody="The main deck will be fenced for two weeks." authorName="Dana Ruiz" portalUrl={url('announcements/1')} />
    ),
    rich: () => (
      <E.AnnouncementEmail
        branding={bulk}
        recipientName="Marisol"
        announcementTitle="Pool deck resurfacing begins October 6"
        announcementBody={'The main deck will be fenced for two weeks while crews grind, patch and reseal the concrete.\n\nThe spa, lap lanes and north sun shelf remain open the entire time.'}
        authorName="Dana Ruiz"
        authorRole="Board President"
        portalUrl={url('announcements/1')}
        isPinned
        showPhoto
      />
    ),
  },
  'maintenance-update-email': {
    accent: 'coral',
    sender: 'association',
    minimal: () => <E.MaintenanceUpdateEmail branding={association} recipientName="Marisol" requestTitle="Leaky faucet in Unit 412" previousStatus="open" newStatus="in_progress" portalUrl={url('maintenance/42')} />,
    rich: () => <E.MaintenanceUpdateEmail branding={bulk} recipientName="Marisol" requestTitle="Leaky faucet in Unit 412" previousStatus="open" newStatus="in_progress" notes="Plumber scheduled for Thursday morning." portalUrl={url('maintenance/42')} />,
  },
  'assessment-due-reminder': {
    accent: 'amber',
    sender: 'association',
    minimal: () => <E.AssessmentDueReminderEmail branding={association} recipientName="Marisol" assessmentTitle="Q4 Community Dues" amountDue="$412.00" dueDate="October 1, 2026" portalUrl={url('payments')} />,
    rich: () => <E.AssessmentDueReminderEmail branding={association} recipientName="Marisol" assessmentTitle="Q4 Community Dues" amountDue="$412.00" dueDate="October 1, 2026" portalUrl={url('payments')} detailRows={[{ label: 'Period covered', value: 'Oct 1 – Dec 31, 2026' }, { label: 'Unit', value: '412' }]} lateFeeNotice={{ title: 'Late fees start October 11', body: 'Balances unpaid ten days after the due date accrue a late fee under the declaration.' }} />,
  },
  'assessment-payment-received': {
    accent: 'green',
    sender: 'association',
    minimal: () => (
      <E.AssessmentPaymentReceivedEmail branding={association} recipientName="Marisol" amountPaid="$412.00" assessmentTitle="Q4 Community Dues" dueDate="October 1, 2026" paymentDate="September 14, 2026" remainingBalance="$0.00" portalUrl={url('payments')} />
    ),
    rich: () => (
      <E.AssessmentPaymentReceivedEmail branding={association} recipientName="Marisol" amountPaid="$412.00" assessmentTitle="Q4 Community Dues" dueDate="October 1, 2026" paymentDate="September 14, 2026" remainingBalance="$0.00" portalUrl={url('payments')} paymentMethod="Bank transfer ending 8871" confirmationNumber="PP-8FQ2-41K9" />
    ),
  },
  'compliance-alert-email': {
    accent: 'red',
    sender: 'association',
    minimal: () => (
      <E.ComplianceAlertEmail branding={association} recipientName="Marisol" alertTitle="Annual financial report not posted" alertDescription="The 2025 annual financial report has not been posted." dashboardUrl={url('compliance')} severity="critical" />
    ),
    rich: () => (
      <E.ComplianceAlertEmail
        branding={bulk}
        recipientName="Marisol"
        alertTitle="Annual financial report not posted"
        alertDescription="The 2025 annual financial report has not been posted."
        dueDate="September 30, 2026"
        dashboardUrl={url('compliance')}
        severity="critical"
        items={[
          { label: 'Year-end balance sheet', owner: 'Treasurer', status: 'missing' },
          { label: 'Reserve schedule & funding disclosure', owner: 'Manager', status: 'in_review' },
          { label: 'Insurance policy', status: 'overdue' },
          { label: 'Independent audit letter', status: 'filed' },
        ]}
      />
    ),
  },
  'insurance-alert-email': {
    accent: 'red',
    sender: 'association',
    minimal: () => (
      <E.InsuranceAlertEmail
        branding={association}
        recipientName="Marisol"
        heading="Windstorm policy expires in 30 days"
        intro="The association's windstorm insurance policy is nearing its expiration date."
        body={['Upload the renewed certificate when it arrives.']}
        disclaimer="PropertyPro does not provide insurance advice."
        portalUrl={url('insurance')}
        senderAddressLines={['1400 Gulf Shore Blvd N', 'Naples, FL 34102']}
        unsubscribeUrl={url('unsubscribe?token=ins')}
      />
    ),
    rich: () => (
      <E.InsuranceAlertEmail
        branding={association}
        recipientName="Marisol"
        heading="Windstorm policy expires in 30 days"
        intro="The association's windstorm insurance policy is nearing its expiration date."
        body={['Upload the renewed certificate when it arrives.']}
        disclaimer="PropertyPro does not provide insurance advice."
        portalUrl={url('insurance')}
        senderAddressLines={['1400 Gulf Shore Blvd N', 'Naples, FL 34102']}
        unsubscribeUrl={url('unsubscribe?token=ins')}
      />
    ),
  },
  'emergency-alert-email': {
    accent: 'red',
    sender: 'association',
    minimal: () => <E.EmergencyAlertEmail branding={association} recipientName="Marisol" alertTitle="Water shut off building-wide until 2 PM" alertBody="A main riser failed on the sixth floor. Do not run taps." severity="emergency" sentAt="5:12 AM · Sep 17" />,
    rich: () => <E.EmergencyAlertEmail branding={association} recipientName="Marisol" alertTitle="Water shut off building-wide until 2 PM" alertBody={'A main riser failed on the sixth floor.\nDo not run taps or flush.'} severity="emergency" sentAt="5:12 AM · Sep 17" />,
  },
  'meeting-notice-email': {
    accent: 'coral',
    sender: 'association',
    minimal: () => (
      <E.MeetingNoticeEmail branding={association} recipientName="Marisol" meetingTitle="2027 budget adoption meeting" meetingDate="Thursday, October 2, 2026" meetingTime="6:30 PM EDT" location="Club room, 2nd floor" meetingType="owner" />
    ),
    rich: () => (
      <E.MeetingNoticeEmail branding={bulk} recipientName="Marisol" meetingTitle="2027 budget adoption meeting" meetingDate="Thursday, October 2, 2026" meetingTime="6:30 PM EDT" location="Club room, 2nd floor" agendaUrl={url('agenda/1')} meetingType="owner" />
    ),
  },
  'calendar-event-reminder-email': {
    accent: 'coral',
    sender: 'association',
    minimal: () => (
      <E.CalendarEventReminderEmail branding={association} recipientName="Marisol" eventLabel="Meeting" eventTitle="Board meeting" reminderTimingLabel="tomorrow" eventDateLabel="Thursday, October 2" ctaLabel="View event" ctaUrl={url('calendar/1')} />
    ),
    rich: () => (
      <E.CalendarEventReminderEmail
        branding={bulk}
        recipientName="Marisol"
        eventLabel="Meeting"
        eventTitle="Board meeting"
        reminderTimingLabel="tomorrow"
        eventDateLabel="Thursday, October 2"
        eventTimeLabel="6:30 PM EDT"
        detailLines={['Location: Club room', 'Agenda posted in the portal']}
        ctaLabel="View event"
        ctaUrl={url('calendar/1')}
      />
    ),
  },
  'notification-digest-email': {
    accent: 'coral',
    sender: 'association',
    minimal: () => (
      <E.NotificationDigestEmail
        branding={association}
        recipientName="Marisol"
        frequency="weekly_digest"
        items={[{ title: 'Pool deck closes October 6', summary: 'Announcement', actionUrl: url('a/1') }]}
        portalUrl={url('dashboard')}
      />
    ),
    rich: () => (
      <E.NotificationDigestEmail
        branding={bulk}
        recipientName="Marisol"
        frequency="weekly_digest"
        items={[
          { title: 'Budget adoption meeting set for October 2', summary: 'Meeting', actionUrl: url('m/1') },
          { title: 'August financials posted', summary: 'Document', actionUrl: url('d/1') },
          { title: 'Updated windstorm insurance certificate', summary: 'Document', actionUrl: url('d/2') },
          { title: 'Pool deck closes October 6 for resurfacing', summary: 'Announcement', actionUrl: url('a/1') },
        ]}
        portalUrl={url('dashboard')}
      />
    ),
  },
  'snowbird-digest-email': {
    accent: 'coral',
    sender: 'association',
    minimal: () => (
      <E.SnowbirdDigestEmail
        branding={association}
        recipientName="Marisol"
        cadenceLabel="Monthly"
        boardDecisions={[]}
        newDocuments={[]}
        upcoming={[]}
        complianceNote={null}
        portalUrl={url('dashboard')}
        unsubscribeUrl={url('unsubscribe?token=snow')}
      />
    ),
    rich: () => (
      <E.SnowbirdDigestEmail
        branding={association}
        recipientName="Marisol"
        cadenceLabel="Monthly"
        boardDecisions={[{ title: 'Approved 2027 budget', detail: 'Adopted at the October 2 meeting', actionUrl: url('d/10') }]}
        newDocuments={[{ title: 'August financial statements', detail: 'Financials', actionUrl: url('d/11') }]}
        upcoming={[{ title: 'Annual meeting', detail: 'Club room', date: 'January 14, 2027', actionUrl: url('m/12') }]}
        complianceNote="All required documents are posted."
        portalUrl={url('dashboard')}
        unsubscribeUrl={url('unsubscribe?token=snow')}
      />
    ),
  },
  'esign-invitation-email': {
    accent: 'violet',
    sender: 'association',
    minimal: () => <E.EsignInvitationEmail branding={association} signerName="Marisol Reyes" senderName="Dana Ruiz" documentName="2026 Amended Rules & Regulations" signingUrl={url('sign/1')} />,
    rich: () => (
      <E.EsignInvitationEmail branding={association} signerName="Marisol Reyes" senderName="Dana Ruiz" documentName="2026 Amended Rules & Regulations" signingUrl={url('sign/1')} expiresAt="October 3, 2026" messageBody="Please review the parking and pet sections before Friday." pageCount={11} signers={[{ name: 'Dana Ruiz', role: 'President', status: 'signed', signedAt: 'Sep 16' }, { name: 'Marisol Reyes', role: 'Director', status: 'awaiting_you' }, { name: 'Priya Raman', role: 'Secretary', status: 'pending' }]} />
    ),
  },
  'esign-reminder-email': {
    accent: 'violet',
    sender: 'association',
    minimal: () => <E.EsignReminderEmail branding={association} signerName="Marisol Reyes" documentName="2026 Amended Rules & Regulations" signingUrl={url('sign/1')} reminderNumber={1} />,
    rich: () => <E.EsignReminderEmail branding={association} signerName="Marisol Reyes" documentName="2026 Amended Rules & Regulations" signingUrl={url('sign/1')} reminderNumber={2} expiresAt="October 3, 2026" />,
  },
  'esign-completed-email': {
    accent: 'green',
    sender: 'association',
    minimal: () => <E.EsignCompletedEmail branding={association} senderName="Dana Ruiz" documentName="2026 Amended Rules & Regulations" completedAt="September 19, 2026" signerCount={4} />,
    rich: () => <E.EsignCompletedEmail branding={association} senderName="Dana Ruiz" documentName="2026 Amended Rules & Regulations" completedAt="September 19, 2026" signerCount={4} />,
  },
  'access-request-pending': {
    accent: 'teal',
    sender: 'association',
    minimal: () => <E.AccessRequestPendingEmail branding={association} adminName="Marisol" requesterName="Alan Whitcomb" requesterEmail="a.whitcomb@example.com" dashboardUrl={url('residents/requests')} />,
    rich: () => <E.AccessRequestPendingEmail branding={association} adminName="Marisol" requesterName="Alan Whitcomb" requesterEmail="a.whitcomb@example.com" claimedUnit="806" role="owner" dashboardUrl={url('residents/requests')} recordCheck={{ label: 'Name matches deed', tone: 'green' }} />,
  },
  'access-request-approved': {
    accent: 'green',
    sender: 'association',
    minimal: () => <E.AccessRequestApprovedEmail branding={association} recipientName="Alan Whitcomb" loginUrl={url('login')} />,
    rich: () => <E.AccessRequestApprovedEmail branding={association} recipientName="Alan Whitcomb" loginUrl={url('login')} />,
  },
  'access-request-denied': {
    accent: 'neutral',
    sender: 'association',
    minimal: () => <E.AccessRequestDeniedEmail branding={association} recipientName="Alan Whitcomb" />,
    rich: () => <E.AccessRequestDeniedEmail branding={association} recipientName="Alan Whitcomb" reason="We could not match the unit to a deed on file." />,
  },
  'document-posted-email': {
    accent: 'coral',
    sender: 'association',
    minimal: () => <E.DocumentPostedEmail branding={association} recipientName="Marisol" documentTitle="August 2026 financial statements" uploadedByName="Carmen Ortiz" portalUrl={url('documents/99')} />,
    rich: () => (
      <E.DocumentPostedEmail branding={bulk} recipientName="Marisol" documentTitle="August 2026 financial statements" documentCategory="Financials" uploadedByName="Carmen Ortiz" portalUrl={url('documents/99')} />
    ),
  },
  'certificate-request-email': {
    accent: 'coral',
    sender: 'association',
    minimal: () => <E.CertificateRequestEmail body="A new estoppel certificate request was submitted for Unit 412." />,
    rich: () => <E.CertificateRequestEmail body={'A new estoppel certificate request was submitted for Unit 412.\nRequested by: Title Co.'} communityName="Sunset Palms HOA" />,
  },

  // ── Platform ─────────────────────────────────────────────────────────────
  'otp-verification': {
    accent: 'coral',
    sender: 'platform',
    minimal: () => <E.OtpVerificationEmail branding={association} recipientName="Marisol" otpCode="481902" />,
    rich: () => (
      <E.OtpVerificationEmail branding={association} recipientName="Marisol" otpCode="481902" requestDetails={{ device: 'Safari on iPhone', location: 'Naples, FL', requestedAt: 'Sep 17, 2026 · 9:04 AM EDT' }} />
    ),
  },
  'password-reset-email': {
    accent: 'coral',
    sender: 'platform',
    minimal: () => <E.PasswordResetEmail branding={association} userName="Marisol" resetUrl={url('reset/token')} />,
    rich: () => <E.PasswordResetEmail branding={association} userName="Marisol" resetUrl={url('reset/token')} expiresInMinutes={60} requestDetails={{ device: 'Chrome on macOS', location: 'Naples, FL' }} />,
  },
  'payment-failed': {
    accent: 'red',
    sender: 'platform',
    minimal: () => <E.PaymentFailedEmail branding={association} recipientName="Dana" amountDue="$249.00" lastFourDigits="4242" billingPortalUrl={url('billing')} />,
    rich: () => <E.PaymentFailedEmail branding={association} recipientName="Dana" amountDue="$249.00" lastFourDigits="4242" billingPortalUrl={url('billing')} invoiceNumber="8841" planLabel="Professional plan" retrySchedule={[{ label: 'Next attempt', value: 'Sep 20 · same card' }, { label: 'Final attempt', value: 'Sep 24' }]} />,
  },
  'authenticate-card': {
    accent: 'amber',
    sender: 'platform',
    minimal: () => <E.AuthenticateCardEmail branding={association} recipientName="Dana" amountDue="$249.00" authenticateUrl={url('authenticate')} billingPortalUrl={url('billing')} />,
    rich: () => <E.AuthenticateCardEmail branding={association} recipientName="Dana" amountDue="$249.00" authenticateUrl={url('authenticate')} billingPortalUrl={url('billing')} />,
  },
  'subscription-expiry-warning': {
    accent: 'red',
    sender: 'platform',
    minimal: () => <E.SubscriptionExpiryWarningEmail branding={association} recipientName="Dana" expiryDate="October 24, 2026" billingPortalUrl={url('billing')} />,
    rich: () => <E.SubscriptionExpiryWarningEmail branding={association} recipientName="Dana" expiryDate="October 24, 2026" billingPortalUrl={url('billing')} atLockout={[{ label: 'Board & manager admin tools', status: 'Suspended', tone: 'red' }, { label: 'Owner portal & statutory documents', status: 'Stays on', tone: 'green' }]} />,
  },
  'subscription-lapsed': {
    accent: 'red',
    sender: 'platform',
    minimal: () => <E.SubscriptionLapsedEmail branding={association} recipientName="Dana" lockedSinceDate="October 24, 2026" billingPortalUrl={url('billing')} />,
    rich: () => <E.SubscriptionLapsedEmail branding={association} recipientName="Dana" lockedSinceDate="October 24, 2026" billingPortalUrl={url('billing')} />,
  },
  'free-access-expiring-email': {
    accent: 'red',
    sender: 'platform',
    minimal: () => <E.FreeAccessExpiringEmail branding={association} recipientName="Dana" communityName="Sunset Palms HOA" daysRemaining={7} subscribeUrl={url('subscribe')} />,
    rich: () => <E.FreeAccessExpiringEmail branding={association} recipientName="Dana" communityName="Sunset Palms HOA" daysRemaining={7} subscribeUrl={url('subscribe')} />,
  },
  'subscription-canceled': {
    accent: 'amber',
    sender: 'platform',
    minimal: () => <E.SubscriptionCanceledEmail branding={association} recipientName="Dana" canceledAt="September 15, 2026" gracePeriodEndDate="October 15, 2026" billingPortalUrl={url('billing')} />,
    rich: () => <E.SubscriptionCanceledEmail branding={association} recipientName="Dana" canceledAt="September 15, 2026" gracePeriodEndDate="October 15, 2026" billingPortalUrl={url('billing')} />,
  },
  'free-access-expired-email': {
    accent: 'amber',
    sender: 'platform',
    minimal: () => <E.FreeAccessExpiredEmail branding={association} recipientName="Dana" communityName="Sunset Palms HOA" subscribeUrl={url('subscribe')} graceDaysRemaining={30} />,
    rich: () => <E.FreeAccessExpiredEmail branding={association} recipientName="Dana" communityName="Sunset Palms HOA" subscribeUrl={url('subscribe')} graceDaysRemaining={30} />,
  },
  'account-deletion-initiated-email': {
    accent: 'neutral',
    sender: 'platform',
    minimal: () => <E.AccountDeletionInitiatedEmail branding={association} recipientName="Marisol" coolingEndDate="September 24, 2026" purgeDate="October 17, 2026" cancelUrl={url('account/cancel-deletion')} />,
    rich: () => <E.AccountDeletionInitiatedEmail branding={association} recipientName="Marisol" coolingEndDate="September 24, 2026" purgeDate="October 17, 2026" cancelUrl={url('account/cancel-deletion')} />,
  },
  'account-deletion-executed-email': {
    accent: 'neutral',
    sender: 'platform',
    minimal: () => <E.AccountDeletionExecutedEmail branding={association} recipientName="Marisol" purgeDate="October 17, 2026" />,
    rich: () => <E.AccountDeletionExecutedEmail branding={association} recipientName="Marisol" purgeDate="October 17, 2026" />,
  },
  'account-recovered-email': {
    accent: 'green',
    sender: 'platform',
    minimal: () => <E.AccountRecoveredEmail branding={association} recipientName="Marisol" />,
    rich: () => <E.AccountRecoveredEmail branding={association} recipientName="Marisol" portalUrl={url('dashboard')} />,
  },
  'community-export-ready-email': {
    accent: 'amber',
    sender: 'platform',
    minimal: () => (
      <E.CommunityExportReadyEmail branding={association} recipientName="Dana" communityName="Sunset Palms HOA" downloadUrl={url('exports/4471')} partCount={1} totalSize="640 MB" expiresOn="October 1, 2026" />
    ),
    rich: () => (
      <E.CommunityExportReadyEmail
        branding={association}
        recipientName="Dana"
        communityName="Sunset Palms HOA"
        downloadUrl={url('exports/4471')}
        partCount={2}
        totalSize="1.4 GB"
        expiresOn="October 1, 2026"
        warnings={['1 document failed a virus scan and was skipped: 2019-roof-bid-scan.pdf', '3 resident photos were unreadable in storage']}
      />
    ),
  },
  'signup-verification-email': {
    accent: 'coral',
    sender: 'platform',
    minimal: () => <E.SignupVerificationEmail branding={{ communityName: 'PropertyPro Florida' }} primaryContactName="Dana" communityName="Sunset Palms HOA" verificationLink={url('verify/abc')} />,
    rich: () => <E.SignupVerificationEmail branding={{ communityName: 'PropertyPro Florida' }} primaryContactName="Dana" communityName="Sunset Palms HOA" verificationLink={url('verify/abc')} remainingSteps={[{ label: 'Association details', value: 'about 4 minutes' }, { label: 'Plan & billing', value: 'after verification' }]} />,
  },
  'root-claimed-email': {
    accent: 'coral',
    sender: 'platform',
    minimal: () => <E.RootClaimedEmail branding={association} claimantName="Dana Ruiz" communityName="Sunset Palms HOA" disputeUrl={url('dispute')} />,
    rich: () => <E.RootClaimedEmail branding={association} claimantName="Dana Ruiz" communityName="Sunset Palms HOA" disputeUrl={url('dispute')} />,
  },

  // ── Deliberate exception ─────────────────────────────────────────────────
  'support-reply-email': {
    accent: 'none',
    sender: 'standalone',
    minimal: () => <E.SupportReplyEmail bodyText="Hi Dana, the upload failed because the file is over 100 MB." mailboxName="PropertyPro Support" mailboxAddress="support@getpropertypro.com" />,
    rich: () => (
      <E.SupportReplyEmail
        bodyText={'Hi Dana,\n\nThe upload is failing because the PDF is 214 MB — our per-file limit is 100 MB.'}
        quotedText={"Hi — I'm trying to post the 2026 reserve study and the upload spins."}
        mailboxName="PropertyPro Support"
        mailboxAddress="support@getpropertypro.com"
      />
    ),
  },
};
