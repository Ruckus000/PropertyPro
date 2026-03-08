import type { CommunityType } from '../index';

export interface ComplianceTemplateItem {
  templateKey: string;
  title: string;
  description: string;
  category: 'governing_documents' | 'financial_records' | 'meeting_records' | 'insurance' | 'operations';
  statuteReference: string;
  deadlineDays?: number;
  rollingMonths?: number;
  isConditional?: boolean;
}

export const CONDO_718_CHECKLIST_TEMPLATE: readonly ComplianceTemplateItem[] = [
  {
    templateKey: '718_declaration',
    title: 'Declaration of Condominium & Amendments',
    description: 'Recorded declaration and all amendments must be available in the owner portal.',
    category: 'governing_documents',
    statuteReference: '§718.111(12)(g)(2)(a)',
    deadlineDays: 30,
  },
  {
    templateKey: '718_bylaws',
    title: 'Bylaws & Amendments',
    description: 'Current bylaws and all amendments must be available to residents.',
    category: 'governing_documents',
    statuteReference: '§718.111(12)(g)(2)(b)',
    deadlineDays: 30,
  },
  {
    templateKey: '718_articles',
    title: 'Articles of Incorporation & Amendments',
    description: 'Articles of Incorporation filed with the state and all amendments.',
    category: 'governing_documents',
    statuteReference: '§718.111(12)(g)(2)(c)',
    deadlineDays: 30,
  },
  {
    templateKey: '718_rules',
    title: 'Rules & Regulations',
    description: 'Current rules and regulations adopted by the board.',
    category: 'governing_documents',
    statuteReference: '§718.111(12)(g)(2)(d)',
    deadlineDays: 30,
  },
  {
    templateKey: '718_qa_sheet',
    title: 'Question & Answer Sheet',
    description: 'Required question and answer sheet for prospective purchasers.',
    category: 'governing_documents',
    statuteReference: '§718.504',
    deadlineDays: 30,
  },
  {
    templateKey: '718_budget',
    title: 'Annual Budget',
    description: 'Annual budget and any proposed budget for the upcoming fiscal year.',
    category: 'financial_records',
    statuteReference: '§718.112(2)(f)',
    deadlineDays: 30,
  },
  {
    templateKey: '718_financial_report',
    title: 'Annual Financial Report',
    description: 'Annual financial report or financial statement for the preceding fiscal year.',
    category: 'financial_records',
    statuteReference: '§718.111(13)',
    deadlineDays: 30,
  },
  {
    templateKey: '718_minutes_rolling_12m',
    title: 'Approved Meeting Minutes (Rolling 12 Months)',
    description: 'Board and owner meeting minutes retained on a rolling 12-month basis.',
    category: 'meeting_records',
    statuteReference: '§718.111(12)(g)(2)(e)',
    rollingMonths: 12,
  },
  {
    templateKey: '718_video_recordings',
    title: 'Video Recordings of Virtual Meetings',
    description: 'Recordings of virtual meetings retained on a rolling 12-month basis.',
    category: 'meeting_records',
    statuteReference: '§718.111(12)(g)(2)(f)',
    rollingMonths: 12,
    isConditional: true,
  },
  {
    templateKey: '718_affidavits',
    title: 'Affidavits Required by Chapter 718',
    description: 'Affidavits required to be executed by officers or directors under Chapter 718.',
    category: 'meeting_records',
    statuteReference: '§718.111(12)(g)(2)(g)',
    deadlineDays: 30,
  },
  {
    templateKey: '718_insurance',
    title: 'Current Insurance Policies',
    description: 'Current insurance policies maintained by the association.',
    category: 'insurance',
    statuteReference: '§718.111(11)',
    deadlineDays: 30,
  },
  {
    templateKey: '718_contracts',
    title: 'List of Executory Contracts',
    description: 'Contracts and instruments under which the association has obligations.',
    category: 'operations',
    statuteReference: '§718.111(12)(g)(2)',
    deadlineDays: 30,
  },
  {
    templateKey: '718_conflict_contracts',
    title: 'Conflict of Interest Contracts',
    description: 'Contracts involving a financial interest by a director or officer.',
    category: 'operations',
    statuteReference: '§718.3026',
    deadlineDays: 30,
    isConditional: true,
  },
  {
    templateKey: '718_bids',
    title: 'Bids Received (After Bidding Closes)',
    description: 'Bids received for work, services, or materials after bidding closes.',
    category: 'operations',
    statuteReference: '§718.111(12)(g)(2)',
    rollingMonths: 12,
    isConditional: true,
  },
  {
    templateKey: '718_inspection_reports',
    title: 'Structural / Milestone Inspection Reports',
    description: 'Milestone or structural inspection reports required for applicable buildings.',
    category: 'operations',
    statuteReference: '§553.899, §718.301(4)(p)',
    isConditional: true,
  },
  {
    templateKey: '718_sirs',
    title: 'Structural Integrity Reserve Study (SIRS)',
    description: 'Structural integrity reserve study as required by statute.',
    category: 'operations',
    statuteReference: '§718.112(2)(g)',
    isConditional: true,
  },
] as const;

export const HOA_720_CHECKLIST_TEMPLATE: readonly ComplianceTemplateItem[] = [
  {
    templateKey: '720_governing_docs',
    title: 'Declaration of Covenants & Amendments',
    description: 'Declaration and recorded amendments must be available to members.',
    category: 'governing_documents',
    statuteReference: '§720.303(4)',
    deadlineDays: 30,
  },
  {
    templateKey: '720_articles',
    title: 'Articles of Incorporation & Amendments',
    description: 'Articles of Incorporation and amendments for the association.',
    category: 'governing_documents',
    statuteReference: '§720.303(4)',
    deadlineDays: 30,
  },
  {
    templateKey: '720_bylaws_rules',
    title: 'Bylaws and Rules & Regulations',
    description: 'Current bylaws and rules adopted by the association.',
    category: 'governing_documents',
    statuteReference: '§720.303(4)',
    deadlineDays: 30,
  },
  {
    templateKey: '720_budget',
    title: 'Annual Budget',
    description: 'Current annual operating budget for the association.',
    category: 'financial_records',
    statuteReference: '§720.303(6)',
    deadlineDays: 30,
  },
  {
    templateKey: '720_financial_report',
    title: 'Annual Financial Report',
    description: 'Annual financial report or statements for the association.',
    category: 'financial_records',
    statuteReference: '§720.303(7)',
    deadlineDays: 30,
  },
  {
    templateKey: '720_minutes_rolling_12m',
    title: 'Meeting Minutes (Rolling 12 Months)',
    description: 'Board and member meeting minutes retained in a rolling 12-month window.',
    category: 'meeting_records',
    statuteReference: '§720.303(4)',
    rollingMonths: 12,
  },
  {
    templateKey: '720_meeting_notices',
    title: 'Meeting Notices and Agendas',
    description: 'Notices and agendas for board and member meetings.',
    category: 'meeting_records',
    statuteReference: '§720.303(2)',
    rollingMonths: 12,
  },
  {
    templateKey: '720_insurance',
    title: 'Current Insurance Policies',
    description: 'Current insurance policies maintained by the association.',
    category: 'insurance',
    statuteReference: '§720.303(4)',
    deadlineDays: 30,
  },
  {
    templateKey: '720_contracts',
    title: 'Current Contracts',
    description: 'Contracts and agreements for services and operations.',
    category: 'operations',
    statuteReference: '§720.303(4)',
    deadlineDays: 30,
  },
  {
    templateKey: '720_bids',
    title: 'Bids Received (After Bidding Closes)',
    description: 'Bids received for work, services, or materials after bidding closes.',
    category: 'operations',
    statuteReference: '§720.303(4)',
    rollingMonths: 12,
    isConditional: true,
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
