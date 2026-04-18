export interface DefaultFaqDefinition {
  question: string;
  answer: string;
  category: string;
  roleVisibility?: readonly string[] | null;
}

const ADMIN_HELP_ROLES = [
  'board_member',
  'board_president',
  'cam',
  'site_manager',
  'property_manager_admin',
  'manager',
  'pm_admin',
] as const;

export const DEFAULT_FAQS: DefaultFaqDefinition[] = [
  {
    question: 'How do I view community documents?',
    answer:
      'Open Documents to browse bylaws, rules, budgets, minutes, and other shared records. Use search or filters to jump to a specific document.',
    category: 'documents',
  },
  {
    question: 'How do I pay my dues or assessments?',
    answer:
      'Open Payments to review your balance, saved payment methods, and recent activity. If online payments are enabled for your community, you can pay there directly.',
    category: 'payments',
  },
  {
    question: 'How do I submit a maintenance request?',
    answer:
      'Open Maintenance and choose Submit Request. Add a clear description, unit details, and photos if helpful, then submit to track updates from management.',
    category: 'maintenance',
  },
  {
    question: 'How do I track my maintenance request status?',
    answer:
      'After you submit a request, return to Maintenance to see status updates such as new, in progress, or resolved, along with notes from the management team.',
    category: 'maintenance',
  },
  {
    question: 'How do I view upcoming meetings?',
    answer:
      'Open Meetings to see upcoming dates, locations, agendas, and posted materials. Past meetings with posted minutes remain available below.',
    category: 'meetings',
  },
  {
    question: 'How do I change my notification preferences?',
    answer:
      'Go to Settings and update your notification preferences to control announcement emails, meeting notices, reminders, and alert frequency.',
    category: 'settings',
  },
  {
    question: 'How do I change my password?',
    answer:
      'Go to Settings > Account or Security to update your password. If you are locked out, use the password reset flow from the login screen.',
    category: 'settings',
  },
  {
    question: 'How do I contact management?',
    answer:
      'Open Help and choose Contact Management to view the current email address, phone number, and primary contact for your community.',
    category: 'support',
  },
  {
    question: 'How do I report a violation or concern?',
    answer:
      'If your community uses violations tracking, open Violations to review your community\'s process or submit a new report when you have permission to do so.',
    category: 'violations',
  },
  {
    question: 'How do I sign documents electronically?',
    answer:
      'Open E-Sign to review documents waiting for your signature. Follow the prompts to confirm your signature and submit the completed form.',
    category: 'esign',
  },
  {
    question: 'How do I post a meeting notice and stay compliant?',
    answer:
      'Admins can open Meetings to create or manage notices. Be sure to review the required posting deadlines and attach agenda materials before publishing.',
    category: 'meetings',
    roleVisibility: ADMIN_HELP_ROLES,
  },
  {
    question: 'How do I review the compliance dashboard?',
    answer:
      'Admins can open Compliance to review which statutory requirements are satisfied, overdue, or missing. The dashboard highlights the next actions that improve the score.',
    category: 'compliance',
    roleVisibility: ADMIN_HELP_ROLES,
  },
  {
    question: 'How do I create or send announcements?',
    answer:
      'Admins can open Announcements to draft updates, publish them to the community, and review previously posted messages.',
    category: 'announcements',
    roleVisibility: ADMIN_HELP_ROLES,
  },
  {
    question: 'How do I manage community records and uploads?',
    answer:
      'Admins can open Documents to upload new files, organize categories, and maintain the records residents should be able to access.',
    category: 'documents',
    roleVisibility: ADMIN_HELP_ROLES,
  },
  {
    question: 'How do I manage residents and access?',
    answer:
      'Admins can open Residents to review the roster, invite people, and update access when ownership, leasing, or staff assignments change.',
    category: 'residents',
    roleVisibility: ADMIN_HELP_ROLES,
  },
];
