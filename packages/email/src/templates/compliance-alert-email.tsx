import { EmailLayout } from '../components/email-layout';
import {
  ActionRow,
  CategoryMark,
  FinePrint,
  Headline,
  ItemRows,
  SectionLabel,
  Strong,
  type ItemRow,
} from '../components/email-blocks';
import { EmailAlert } from '../components/email-alert';
import type { EmailTone } from '../components/theme';
import type { BaseEmailProps } from '../types';

/**
 * `missing` — no document posted; `overdue` — a document exists but was posted
 * late or has fallen outside its window (the compliance calculator's own term).
 */
export type ComplianceItemStatus = 'missing' | 'overdue' | 'in_review' | 'filed';

export interface ComplianceAlertItem {
  label: string;
  owner?: string;
  status: ComplianceItemStatus;
}

export interface ComplianceAlertEmailProps extends BaseEmailProps {
  recipientName: string;
  alertTitle: string;
  alertDescription: string;
  dueDate?: string;
  dashboardUrl: string;
  severity: 'info' | 'warning' | 'critical';
  /** Optional punch list: the outstanding items behind this alert. Rendered only when supplied. */
  items?: ComplianceAlertItem[];
}

const SEVERITY: Record<ComplianceAlertEmailProps['severity'], { label: string; tone: EmailTone }> = {
  critical: { label: 'Critical', tone: 'red' },
  warning: { label: 'Warning', tone: 'amber' },
  info: { label: 'Info', tone: 'teal' },
};

const ITEM_STATUS: Record<ComplianceItemStatus, { label: string; tone: EmailTone }> = {
  missing: { label: 'Missing', tone: 'red' },
  overdue: { label: 'Overdue', tone: 'red' },
  in_review: { label: 'In review', tone: 'amber' },
  filed: { label: 'Filed', tone: 'green' },
};

/** Layout A4 · Compliance alert — what is missing, who owns it, by when. */
export function ComplianceAlertEmail({
  branding,
  previewText,
  recipientName,
  alertTitle,
  alertDescription,
  dueDate,
  dashboardUrl,
  severity,
  items,
}: ComplianceAlertEmailProps) {
  const badge = SEVERITY[severity];
  const rows: ItemRow[] = (items ?? []).map((item) => ({
    title: item.label,
    detail: item.owner ? `Owner: ${item.owner}` : undefined,
    status: ITEM_STATUS[item.status],
  }));

  return (
    <EmailLayout
      branding={branding}
      tone="red"
      previewText={previewText ?? `Compliance alert: ${alertTitle}`}
      mastheadContext="Board & manager notice"
      mastheadChip={badge}
      footerReason="Compliance alerts go to the association's board and managers."
    >
      <CategoryMark icon="alert-red" label="Compliance alert · §718.111(12)(g)" tone="red" />
      <Headline
        lede={
          <>
            Hi {recipientName} — a compliance item needs attention at <Strong>{branding.communityName}</Strong>.
          </>
        }
      >
        {alertTitle}
      </Headline>
      <EmailAlert variant="danger" title={dueDate ? <>Due by {dueDate}</> : `Missing: ${alertTitle}`}>
        {alertDescription}
      </EmailAlert>
      {rows.length > 0 && (
        <>
          <SectionLabel icon="doc-slate">Outstanding items</SectionLabel>
          <ItemRows items={rows} />
        </>
      )}
      <ActionRow href={dashboardUrl} label="View compliance dashboard" variant="destructive" />
      <FinePrint>
        Florida Statute §718.111(12)(g) requires timely posting of association documents. Failure to comply may result in
        regulatory action.
      </FinePrint>
    </EmailLayout>
  );
}
