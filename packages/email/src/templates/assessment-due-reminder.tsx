import { EmailLayout } from '../components/email-layout';
import { EmailAlert } from '../components/email-alert';
import { ActionRow, CategoryMark, DataRows, Figure, FinePrint, Headline, MultilineText, Strong } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

/** One label/value line of statement detail (e.g. "Period covered"). */
export interface AssessmentDetailRow {
  label: string;
  value: string;
}

/** A stated late-fee rule. Supply only real, association-specific terms. */
export interface AssessmentLateFeeNotice {
  title: string;
  body: string;
}

export interface AssessmentDueReminderEmailProps extends BaseEmailProps {
  recipientName: string;
  assessmentTitle: string;
  amountDue: string;
  dueDate: string;
  portalUrl: string;
  /** Optional statement detail rows under the amount. Rendered only when supplied. */
  detailRows?: AssessmentDetailRow[];
  /**
   * Optional explicit late-fee notice. When supplied it replaces the generic
   * "avoid any late fees" line; the template never invents fee terms.
   */
  lateFeeNotice?: AssessmentLateFeeNotice;
}

/**
 * Layout A3 · Assessment due — get the assessment paid before it is late. The
 * amount is the largest object in the email (amber: due, not yet late).
 */
export function AssessmentDueReminderEmail({
  branding,
  previewText,
  recipientName,
  assessmentTitle,
  amountDue,
  dueDate,
  portalUrl,
  detailRows,
  lateFeeNotice,
}: AssessmentDueReminderEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      tone="amber"
      previewText={previewText ?? `Reminder: ${assessmentTitle} of ${amountDue} is due ${dueDate}`}
      mastheadContext="Assessment reminder"
    >
      <CategoryMark icon="clock-amber" label="Payment reminder" tone="amber" />
      <Headline
        lede={
          <>
            Hi {recipientName} — this is a friendly reminder that your assessment <Strong>{assessmentTitle}</Strong> for{' '}
            <Strong>{branding.communityName}</Strong> is due on <Strong>{dueDate}</Strong>.
          </>
        }
      >
        Assessment due reminder
      </Headline>
      <Figure label="Amount due" amount={amountDue} tone="amber" asideLabel="Due date" asideValue={dueDate} />
      {detailRows && detailRows.length > 0 && <DataRows rows={detailRows} />}
      {lateFeeNotice ? (
        <EmailAlert variant="warning" title={lateFeeNotice.title}>
          <MultilineText text={lateFeeNotice.body} />
        </EmailAlert>
      ) : (
        <EmailAlert variant="warning">Please make your payment before the due date to avoid any late fees.</EmailAlert>
      )}
      <ActionRow href={portalUrl} label="Pay now" variant="warning" />
      <FinePrint>
        If you have already made this payment, please disregard this reminder. For questions about your assessment,
        please contact your association.
      </FinePrint>
    </EmailLayout>
  );
}
