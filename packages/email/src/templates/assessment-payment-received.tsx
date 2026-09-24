import { EmailLayout } from '../components/email-layout';
import { ActionRow, CategoryMark, DataRows, Figure, FinePrint, Headline, Strong } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface AssessmentPaymentReceivedEmailProps extends BaseEmailProps {
  recipientName: string;
  amountPaid: string;
  assessmentTitle: string;
  dueDate: string;
  paymentDate: string;
  remainingBalance: string;
  portalUrl: string;
  /** Optional: how the payment was made (e.g. "Bank transfer ···· 8871"). Rendered only when supplied. */
  paymentMethod?: string;
  /** Optional: processor confirmation number, set in mono. Rendered only when supplied. */
  confirmationNumber?: string;
}

/**
 * Layout A10 · Payment received — a receipt to be filed, not read. The green
 * figure mirrors the amber one on the due reminder: same object, paid state.
 */
export function AssessmentPaymentReceivedEmail({
  branding,
  previewText,
  recipientName,
  amountPaid,
  assessmentTitle,
  dueDate,
  paymentDate,
  remainingBalance,
  portalUrl,
  paymentMethod,
  confirmationNumber,
}: AssessmentPaymentReceivedEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      tone="green"
      previewText={previewText ?? `Payment of ${amountPaid} received`}
      mastheadContext="Payment receipt"
    >
      <CategoryMark icon="check-green" label={<>Payment received · {paymentDate}</>} tone="green" />
      <Headline
        lede={
          <>
            Hi {recipientName} — your payment of <Strong>{amountPaid}</Strong> for <Strong>{assessmentTitle}</Strong> (due{' '}
            {dueDate}) has been successfully processed on {paymentDate}.
          </>
        }
      >
        Payment received
      </Headline>
      <Figure label="Amount paid" amount={amountPaid} tone="green" asideLabel="Remaining balance" asideValue={remainingBalance} />
      <DataRows
        rows={[
          { label: 'Assessment', value: assessmentTitle },
          { label: 'Due date', value: dueDate },
          { label: 'Payment date', value: paymentDate },
          { label: 'Method', value: paymentMethod },
          { label: 'Confirmation', value: confirmationNumber, mono: true },
        ]}
      />
      <ActionRow href={portalUrl} label="View payment history" variant="success" />
      <FinePrint>
        This is a confirmation of your payment. No further action is required. If you have questions, please contact
        your association.
      </FinePrint>
    </EmailLayout>
  );
}
