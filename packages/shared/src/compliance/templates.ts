import type { CommunityType } from '../index';

export type DefaultVisibility = 'public_page' | 'owner_portal' | 'owner_only' | 'board';

export interface ComplianceTemplateItem {
  templateKey: string;
  title: string;
  description: string;
  category: 'governing_documents' | 'financial_records' | 'meeting_records' | 'insurance' | 'operations';
  statuteReference: string;
  deadlineDays?: number;
  rollingMonths?: number;
  isConditional?: boolean;
  defaultVisibility: DefaultVisibility;
  /**
   * Document category a row's upload is filed under, when `category` (a
   * checklist grouping) is not itself a document category. The operations
   * group has no category of that name, so its rows name one here.
   */
  documentCategory?: 'Contracts' | 'Inspection Reports';
}

export const CONDO_718_CHECKLIST_TEMPLATE: readonly ComplianceTemplateItem[] = [
  {
    templateKey: '718_declaration',
    title: 'Declaration of Condominium & Amendments',
    description: 'Recorded declaration and all amendments must be available in the owner portal.',
    category: 'governing_documents',
    statuteReference: '§718.111(12)(g)(2)(a)',
    deadlineDays: 30,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '718_bylaws',
    title: 'Bylaws & Amendments',
    description: 'Current bylaws and all amendments must be available to residents.',
    category: 'governing_documents',
    statuteReference: '§718.111(12)(g)(2)(b)',
    deadlineDays: 30,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '718_articles',
    title: 'Articles of Incorporation & Amendments',
    description: 'Articles of Incorporation filed with the state and all amendments.',
    category: 'governing_documents',
    statuteReference: '§718.111(12)(g)(2)(c)',
    deadlineDays: 30,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '718_rules',
    title: 'Rules & Regulations',
    description: 'Current rules and regulations adopted by the board.',
    category: 'governing_documents',
    statuteReference: '§718.111(12)(g)(2)(d)',
    deadlineDays: 30,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '718_qa_sheet',
    title: 'Question & Answer Sheet',
    description:
      'Question and answer sheet the association prepares for prospective purchasers. Recommended: §718.111(12)(g) does not list it for the website.',
    category: 'governing_documents',
    statuteReference: '§718.504',
    deadlineDays: 30,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '718_budget',
    title: 'Annual Budget',
    description: 'Annual budget and any proposed budget to be considered at the annual meeting.',
    category: 'financial_records',
    statuteReference: '§718.111(12)(g)(2)(h), §718.112(2)(f)',
    deadlineDays: 30,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '718_financial_report',
    title: 'Annual Financial Report',
    description: 'Annual financial report or financial statement for the preceding fiscal year.',
    category: 'financial_records',
    statuteReference: '§718.111(12)(g)(2)(i), §718.111(13)',
    deadlineDays: 30,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '718_monthly_statements',
    title: 'Monthly Income and Expense Statements',
    description:
      'Any monthly income or expense statement to be considered at a meeting, kept on a rolling 12-month basis.',
    category: 'financial_records',
    statuteReference: '§718.111(12)(g)(2)(i)',
    rollingMonths: 12,
    isConditional: true,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '718_minutes_rolling_12m',
    title: 'Approved Meeting Minutes (Rolling 12 Months)',
    description: 'Board and owner meeting minutes retained on a rolling 12-month basis.',
    category: 'meeting_records',
    statuteReference: '§718.111(12)(g)(2)(e)',
    rollingMonths: 12,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '718_video_recordings',
    title: 'Video Recordings of Virtual Meetings',
    description: 'Recordings of virtual meetings retained on a rolling 12-month basis.',
    category: 'meeting_records',
    statuteReference: '§718.111(12)(g)(2)(f)',
    rollingMonths: 12,
    isConditional: true,
    defaultVisibility: 'owner_portal',
  },
  {
    /**
     * The condo checklist had no meeting-notice item, so an association could
     * sit at 100% compliance having never posted a single notice or agenda —
     * while the product's own `meeting-calculator` correctly computed the
     * 14-day and 48-hour lead times the whole time. The math existed; it just
     * never became a scored obligation.
     *
     * Shaped to match `720_meeting_notices`, which was already present — the
     * HOA side of this was right and only the 718 side was missing.
     *
     * See docs/audits/2026-08-09-legal-risk-audit.md F-01.
     */
    templateKey: '718_meeting_notices',
    title: 'Meeting Notices and Agendas',
    description:
      'Notices and agendas for board and unit-owner meetings, posted in advance of each meeting.',
    category: 'meeting_records',
    statuteReference: '§718.111(12)(g)(2)(m)-(n), §718.112(2)(c)',
    rollingMonths: 12,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '718_affidavits',
    title: 'Affidavits Required by Chapter 718',
    description: 'Affidavits required to be executed by officers or directors under Chapter 718.',
    category: 'meeting_records',
    statuteReference: '§718.111(12)(g)(2)(r)',
    deadlineDays: 30,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '718_director_certifications',
    title: 'Director Certifications',
    description:
      "Each director's written certification, or certificate of completed education, required within one year of joining the board.",
    category: 'meeting_records',
    statuteReference: '§718.111(12)(g)(2)(j), §718.112(2)(d)5.b.',
    deadlineDays: 30,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '718_conflict_of_interest',
    title: 'Conflict of Interest Documents',
    description:
      'Conflict-of-interest contracts and documents, such as disclosures by a director or the community association manager.',
    category: 'meeting_records',
    statuteReference: '§718.111(12)(g)(2)(l)',
    deadlineDays: 30,
    isConditional: true,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '718_insurance',
    title: 'Current Insurance Policies',
    description:
      'Current insurance policies maintained by the association. Recommended: §718.111(12)(g) does not list them for the website.',
    category: 'insurance',
    statuteReference: '§718.111(11)',
    deadlineDays: 30,
    defaultVisibility: 'owner_only',
  },
  {
    templateKey: '718_contracts',
    title: 'List of Executory Contracts',
    description: 'Contracts and instruments under which the association has obligations.',
    category: 'operations',
    documentCategory: 'Contracts',
    statuteReference: '§718.111(12)(g)(2)(g)',
    deadlineDays: 30,
    defaultVisibility: 'owner_only',
  },
  {
    templateKey: '718_conflict_contracts',
    title: 'Conflict of Interest Contracts',
    description: 'Contracts involving a financial interest by a director or officer.',
    category: 'operations',
    documentCategory: 'Contracts',
    statuteReference: '§718.111(12)(g)(2)(k), §718.3026',
    deadlineDays: 30,
    isConditional: true,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '718_bids',
    title: 'Bids Received (After Bidding Closes)',
    description: 'Bids received for work, services, or materials after bidding closes.',
    category: 'operations',
    documentCategory: 'Contracts',
    statuteReference: '§718.111(12)(g)(2)(g)',
    rollingMonths: 12,
    isConditional: true,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '718_inspection_reports',
    title: 'Structural / Milestone Inspection Reports',
    description: 'Milestone or structural inspection reports required for applicable buildings.',
    category: 'operations',
    documentCategory: 'Inspection Reports',
    statuteReference: '§718.111(12)(g)(2)(o), §553.899, §718.301(4)(p)',
    isConditional: true,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '718_sirs',
    title: 'Structural Integrity Reserve Study (SIRS)',
    description: 'Structural integrity reserve study as required by statute.',
    category: 'operations',
    documentCategory: 'Inspection Reports',
    statuteReference: '§718.111(12)(g)(2)(p), §718.112(2)(g)',
    isConditional: true,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '718_building_permits',
    title: 'Building Permits',
    description: 'Copies of all building permits for ongoing or planned construction.',
    category: 'operations',
    documentCategory: 'Inspection Reports',
    statuteReference: '§718.111(12)(g)(2)(q)',
    deadlineDays: 30,
    isConditional: true,
    defaultVisibility: 'owner_portal',
  },
] as const;

export const HOA_720_CHECKLIST_TEMPLATE: readonly ComplianceTemplateItem[] = [
  {
    templateKey: '720_governing_docs',
    title: 'Declaration of Covenants & Amendments',
    description: 'Declaration and recorded amendments must be available to members.',
    category: 'governing_documents',
    statuteReference: '§720.303(4)(b)(1)(c)',
    deadlineDays: 30,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '720_articles',
    title: 'Articles of Incorporation & Amendments',
    description: 'Articles of Incorporation and amendments for the association.',
    category: 'governing_documents',
    statuteReference: '§720.303(4)(b)(1)(a)',
    deadlineDays: 30,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '720_bylaws_rules',
    title: 'Bylaws and Rules & Regulations',
    description: 'Current bylaws and rules adopted by the association.',
    category: 'governing_documents',
    statuteReference: '§720.303(4)(b)(1)(b), (d)',
    deadlineDays: 30,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '720_retention_rules',
    title: 'Records Retention Rules',
    description:
      "The association's written rules on how official records are kept and for how long, made available through the website.",
    category: 'governing_documents',
    statuteReference: '§720.303(4)(c)',
    deadlineDays: 30,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '720_budget',
    title: 'Annual Budget',
    description: 'Annual budget and any proposed budget to be considered at the annual meeting.',
    category: 'financial_records',
    statuteReference: '§720.303(4)(b)(1)(f), §720.303(6)',
    deadlineDays: 30,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '720_financial_report',
    title: 'Annual Financial Report',
    description: 'Annual financial report or statements for the association.',
    category: 'financial_records',
    statuteReference: '§720.303(4)(b)(1)(g), §720.303(7)',
    deadlineDays: 30,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '720_monthly_statements',
    title: 'Monthly Income and Expense Statements',
    description:
      'Any monthly income or expense statement to be considered at a meeting, kept on a rolling 12-month basis.',
    category: 'financial_records',
    statuteReference: '§720.303(4)(b)(1)(g)',
    rollingMonths: 12,
    isConditional: true,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '720_minutes_rolling_12m',
    title: 'Meeting Minutes (Rolling 12 Months)',
    description:
      'Board and member meeting minutes retained in a rolling 12-month window. Recommended: §720.303(4)(b) does not list minutes for the website.',
    category: 'meeting_records',
    statuteReference: '§720.303(4)',
    rollingMonths: 12,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '720_meeting_notices',
    title: 'Meeting Notices and Agendas',
    description: 'Notices and agendas for board and member meetings.',
    category: 'meeting_records',
    statuteReference: '§720.303(4)(b)(1)(l)-(m), §720.303(2)',
    rollingMonths: 12,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '720_director_certifications',
    title: 'Director Certifications',
    description:
      "Each director's written certification, or certificate of completed education, required after joining the board.",
    category: 'meeting_records',
    statuteReference: '§720.303(4)(b)(1)(i), §720.3033(1)(a)',
    deadlineDays: 30,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '720_insurance',
    title: 'Current Insurance Policies',
    description: 'Current insurance policies maintained by the association.',
    category: 'insurance',
    statuteReference: '§720.303(4)(b)(1)(h)',
    deadlineDays: 30,
    defaultVisibility: 'owner_only',
  },
  {
    templateKey: '720_contracts',
    title: 'List of Executory Contracts',
    description: 'A list of current contracts and other documents under which the association has an obligation.',
    category: 'operations',
    documentCategory: 'Contracts',
    statuteReference: '§720.303(4)(b)(1)(e)',
    deadlineDays: 30,
    defaultVisibility: 'owner_only',
  },
  {
    templateKey: '720_bids',
    title: 'Bids Received (After Bidding Closes)',
    description: 'Bids received for work, services, or materials after bidding closes.',
    category: 'operations',
    documentCategory: 'Contracts',
    statuteReference: '§720.303(4)(b)(1)(e)',
    rollingMonths: 12,
    isConditional: true,
    defaultVisibility: 'owner_portal',
  },
  {
    templateKey: '720_conflict_of_interest',
    title: 'Conflict of Interest Contracts and Documents',
    description:
      'Contracts or transactions with a director, officer or related entity with a financial interest, and other conflict-of-interest documents.',
    category: 'operations',
    documentCategory: 'Contracts',
    statuteReference: '§720.303(4)(b)(1)(j)-(k)',
    deadlineDays: 30,
    isConditional: true,
    defaultVisibility: 'owner_portal',
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
