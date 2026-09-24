import { EmailLayout } from '../components/email-layout';
import { ActionRow, CategoryMark, DataRows, FinePrint, Headline, StatusPill, Strong } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

/** A check of the request against association records, shown as a pill so approving isn't blind. */
export interface AccessRequestRecordCheck {
  label: string;
  tone: 'green' | 'amber' | 'red';
}

export interface AccessRequestPendingEmailProps extends BaseEmailProps {
  adminName: string;
  requesterName: string;
  requesterEmail: string;
  claimedUnit?: string;
  role?: string;
  dashboardUrl: string;
  /** Optional record-check result. The row renders only when supplied. */
  recordCheck?: AccessRequestRecordCheck;
}

/**
 * Layout A9 · Access request (pending) — let a volunteer admin decide from the
 * inbox, safely. Teal, the informational accent: this is a queue item, not an
 * announcement. One review action; the decision itself happens in the portal.
 */
export function AccessRequestPendingEmail({
  branding,
  previewText,
  adminName,
  requesterName,
  requesterEmail,
  claimedUnit,
  role,
  dashboardUrl,
  recordCheck,
}: AccessRequestPendingEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      tone="teal"
      previewText={previewText ?? 'New resident access request'}
      mastheadContext="Administrator notification"
      mastheadChip={{ label: 'Awaiting review', tone: 'teal' }}
    >
      <CategoryMark icon="user-teal" label="Access request" tone="teal" />
      <Headline
        lede={
          <>
            Hi {adminName} — a resident has requested portal access to <Strong>{branding.communityName}</Strong> and
            is waiting for your review.
          </>
        }
      >
        A resident is waiting for portal access
      </Headline>
      <DataRows
        variant="panel"
        rows={[
          { label: 'Name', value: requesterName },
          { label: 'Email', value: requesterEmail },
          { label: 'Unit', value: claimedUnit },
          { label: 'Role', value: role },
          {
            label: 'Record check',
            value: recordCheck ? <StatusPill tone={recordCheck.tone}>{recordCheck.label}</StatusPill> : undefined,
          },
        ]}
      />
      <ActionRow href={dashboardUrl} label="Review request" variant="teal" />
      <FinePrint>
        This notification was sent to you as an administrator of {branding.communityName}. Only admins receive access
        request alerts.
      </FinePrint>
    </EmailLayout>
  );
}
