export interface DefaultFaqDefinition {
  question: string;
  answer: string;
  category: string;
  roleVisibility?: readonly string[] | null;
}

export type DefaultFaq = DefaultFaqDefinition;

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
    question: 'How do I view my assessment balance?',
    answer:
      'Open Payments to review your current balance, payment history, and any upcoming charges in one place.',
    category: 'payments',
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
  {
    question: 'What is the difference between an announcement and a meeting notice?',
    answer:
      'An announcement is a general community message (newsletters, reminders, alerts). A meeting notice is a statutorily required communication with specific timing rules — 14 days ahead for owner meetings, 48 hours for most board meetings. Use Meetings for notices; use Announcements for everything else.',
    category: 'meetings',
  },
  {
    question: 'What does the 30-day document posting window mean?',
    answer:
      'Florida condo associations must post required records within 30 days of when the record was finalized. The compliance dashboard tracks that window for every required document category and flags anything approaching the deadline.',
    category: 'compliance',
    roleVisibility: ADMIN_HELP_ROLES,
  },
  {
    question: 'How do I subscribe to the meeting calendar?',
    answer:
      'Open Meetings and click Subscribe. Copy the feed URL into Google Calendar, Apple Calendar, or Outlook. Rescheduled or cancelled meetings update automatically once you subscribe.',
    category: 'meetings',
  },
  {
    question: 'Can I update my feedback on a help article?',
    answer:
      'Yes — click Helpful or Not helpful any time. Your most recent rating is the one that\'s saved, and you can add a comment explaining what would be clearer.',
    category: 'support',
  },
  {
    question: 'Why did my compliance score drop after I uploaded a document?',
    answer:
      'Check the category. Uploading a file under the wrong category (like Annual Budget under Other) means the engine can\'t link it to the requirement. Reclassify and the score will recover.',
    category: 'compliance',
    roleVisibility: ADMIN_HELP_ROLES,
  },
  {
    question: 'How do I change my community contact information?',
    answer:
      'Admins set the community contact (email, phone, primary contact name) in Settings. Residents see the current contact on the Help > Contact Management page.',
    category: 'settings',
  },
  {
    question: 'What happens to my data if I delete my account?',
    answer:
      'Account deletion runs on a grace period so you can cancel. During the grace window your data is preserved; after the window, personal data is removed in accordance with our retention policy. Community records that your association must keep for regulatory reasons remain in the community\'s archive.',
    category: 'settings',
  },
  {
    question: 'Who can see my maintenance request?',
    answer:
      'Your request is visible to you and to your community\'s maintenance staff and admins. Other residents cannot see it. Any comments, photos, and status changes remain private to the same audience.',
    category: 'maintenance',
  },
];
