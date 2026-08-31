export interface CommunityWriteSettings {
  announcementsWriteLevel?: 'all_members' | 'admin_only';
  meetingsWriteLevel?: 'all_members' | 'admin_only';
  meetingDocumentsWriteLevel?: 'all_members' | 'admin_only';
  unitsWriteLevel?: 'all_members' | 'admin_only';
  leasesWriteLevel?: 'all_members' | 'admin_only';
  documentCategoriesWriteLevel?: 'all_members' | 'admin_only';
}

/**
 * Per-community legal gates. All default to OFF when the key is absent, which is
 * every community until a platform admin turns one on.
 * See docs/audits/2026-08-09-legal-risk-audit.md §2a.
 */
export interface CommunitySettings extends CommunityWriteSettings {
  electionsAttorneyReviewed?: boolean;
  violationFinesEnabled?: boolean;
  assessmentPaymentsEnabled?: boolean;
  smsDispatchEnabled?: boolean;
  noticePdfGenerationEnabled?: boolean;
}

export type LegalGateKey =
  | 'electionsAttorneyReviewed'
  | 'violationFinesEnabled'
  | 'assessmentPaymentsEnabled'
  | 'smsDispatchEnabled'
  | 'noticePdfGenerationEnabled';

/**
 * Admin-facing copy for each gate. The descriptions deliberately state WHY a gate
 * is off, so the person flipping it knows what they are accepting — a toggle
 * labelled only "Enable fines" invites turning it on without that context.
 */
export const LEGAL_GATES: ReadonlyArray<{
  key: LegalGateKey;
  title: string;
  description: string;
}> = [
  {
    key: 'electionsAttorneyReviewed',
    title: 'Board elections',
    description:
      'Requires attorney review. Ballots currently store a permanent unit-to-candidate link, which conflicts with the §718.128 requirement that a ballot cannot be tied to a specific unit owner.',
  },
  {
    key: 'violationFinesEnabled',
    title: 'Violation fines',
    description:
      'No statutory cap ($100 per violation / $1,000 aggregate) and no fining-committee approval are enforced yet. Existing fines stay visible and payable regardless of this setting.',
  },
  {
    key: 'assessmentPaymentsEnabled',
    title: 'Online payments',
    description:
      'Payments run as Stripe destination charges, so funds transit PropertyPro and chargeback liability sits with us. Also pauses automatic late-fee accrual, so residents are not penalised for a payment method they cannot use.',
  },
  {
    key: 'smsDispatchEnabled',
    title: 'SMS dispatch',
    description:
      'No inbound STOP handler exists, so TCPA consent revocation is not recorded. Emergency broadcasts still send by email when this is off. Also requires SMS_DISPATCH_ENABLED at the deployment level.',
  },
  {
    key: 'noticePdfGenerationEnabled',
    title: 'Generated legal notices',
    description:
      'The generated violation and hearing notices state legal conclusions and name the Board as imposing a fine where the statute requires a fining committee.',
  },
];
