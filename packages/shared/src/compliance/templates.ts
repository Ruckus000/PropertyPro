import type { CommunityType } from '../index';

export interface ComplianceTemplateItem {
  templateKey: string;
  title: string;
  description: string;
  category: 'governing_documents' | 'financial_records' | 'meeting_records' | 'insurance' | 'operations';
  statuteReference: string;
  deadlineDays?: number;
  rollingMonths?: number;
}

export const CONDO_718_CHECKLIST_TEMPLATE: readonly ComplianceTemplateItem[] = [
  {
    templateKey: '718_bylaws',
    title: 'Association bylaws available',
    description: 'Current bylaws must be posted and available to residents.',
    category: 'governing_documents',
    statuteReference: '§718.111(12)(a)1',
    deadlineDays: 30,
  },
  {
    templateKey: '718_budget',
    title: 'Annual budget posting',
    description: 'Annual budget and material updates must be posted for owners.',
    category: 'financial_records',
    statuteReference: '§718.112(2)(f)',
    deadlineDays: 30,
  },
  {
    templateKey: '718_minutes_rolling_12m',
    title: 'Meeting minutes (rolling 12 months)',
    description: 'Board and owner minutes should remain available on a rolling 12-month window.',
    category: 'meeting_records',
    statuteReference: '§718.111(12)(c)',
    rollingMonths: 12,
  },
] as const;

export const HOA_720_CHECKLIST_TEMPLATE: readonly ComplianceTemplateItem[] = [
  {
    templateKey: '720_governing_docs',
    title: 'Governing documents posting',
    description: 'Declaration and rules must be available to members.',
    category: 'governing_documents',
    statuteReference: '§720.303(4)',
    deadlineDays: 30,
  },
  {
    templateKey: '720_financial_report',
    title: 'Financial reporting availability',
    description: 'Financial reports must be produced and available to members.',
    category: 'financial_records',
    statuteReference: '§720.303(7)',
    deadlineDays: 30,
  },
  {
    templateKey: '720_minutes_rolling_12m',
    title: 'Meeting minutes (rolling 12 months)',
    description: 'Association minutes are retained in a rolling 12-month window.',
    category: 'meeting_records',
    statuteReference: '§720.303(4)(l)',
    rollingMonths: 12,
  },
] as const;

export function getComplianceTemplate(communityType: CommunityType): readonly ComplianceTemplateItem[] {
  if (communityType === 'condo_718') {
    return CONDO_718_CHECKLIST_TEMPLATE;
  }

  if (communityType === 'hoa_720') {
    return HOA_720_CHECKLIST_TEMPLATE;
  }

  return [];
}
