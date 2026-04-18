export interface DefaultFaq {
  question: string;
  answer: string;
  category: string;
}

export const DEFAULT_FAQS: DefaultFaq[] = [
  // Getting Started
  {
    question: 'How do I submit a maintenance request?',
    answer:
      'From the sidebar, click Operations then select the Requests tab. Click "Submit Request", fill in the details, attach any photos, and submit. You\'ll receive updates as your request is processed.',
    category: 'getting-started',
  },
  {
    question: 'How do I view community documents?',
    answer:
      'Click Documents in the sidebar. You can browse by category or use the search bar to find specific documents. Click any document to view or download it.',
    category: 'getting-started',
  },
  {
    question: 'How do I view upcoming meetings?',
    answer:
      'Click Meetings in the sidebar. Upcoming meetings are shown at the top with date, time, and location. Past meetings with posted minutes appear below.',
    category: 'getting-started',
  },
  {
    question: 'How do I update my notification preferences?',
    answer:
      'Go to Settings from the profile menu and scroll to the Email Notifications section. You can toggle announcements, meeting notices, and in-app alerts, and choose your email frequency.',
    category: 'account',
  },
  {
    question: 'How do I change my password?',
    answer:
      'Go to Settings > Security. Enter your current password, then your new password twice to confirm. If you\'ve forgotten your current password, use the "Forgot your password?" link on the login page.',
    category: 'account',
  },
  // Operations
  {
    question: 'How do I track the status of my maintenance request?',
    answer:
      'Go to Operations > Requests. Your submitted requests show their current status: Open, In Progress, Completed, or Closed. You\'ll also receive notifications when the status changes.',
    category: 'operations',
  },
  {
    question: 'How do I report a violation?',
    answer:
      'Click "Report Violation" in the sidebar. Describe the issue, select the violation type, add photos if possible, and submit. Your management team will review and respond.',
    category: 'operations',
  },
  // Board & Compliance
  {
    question: 'What is the compliance score?',
    answer:
      'The compliance score measures how well your community meets Florida statutory requirements for document posting, meeting notices, and record-keeping. A score above 90% indicates strong compliance. Visit the Help Center for a detailed guide.',
    category: 'compliance',
  },
  {
    question: 'How do I vote in a board poll?',
    answer:
      'When a poll is active, you\'ll see it on the Board page. Click the poll, review the options, and cast your vote. Results are visible once the poll closes.',
    category: 'board',
  },
  // Payments & Finance
  {
    question: 'How do I view my assessment balance?',
    answer:
      'Click Payments in the sidebar to see your current balance, payment history, and any upcoming assessments. You can make payments directly through the platform if online payments are enabled.',
    category: 'payments',
  },
  // E-Sign
  {
    question: 'How do I sign a document electronically?',
    answer:
      'When a document is sent for your signature, you\'ll receive an email notification with a link. Click the link, review the document, and follow the on-screen instructions to sign. You can also find pending signatures in your E-Sign section.',
    category: 'esign',
  },
  // Emergency
  {
    question: 'What are emergency broadcasts?',
    answer:
      'Emergency broadcasts are urgent messages sent to all community members via push notification, email, and in-app alert. They\'re used for situations like severe weather, security incidents, or critical maintenance issues.',
    category: 'emergency',
  },
  // Move-in/out
  {
    question: 'How does the move-in/move-out process work?',
    answer:
      'Your management team will create a move checklist for your unit. You can view the checklist from the Leases section, track completed items, and coordinate with management on any remaining steps.',
    category: 'operations',
  },
  // Admin-specific
  {
    question: 'How do I upload a document for compliance?',
    answer:
      'Go to Documents, click "Upload Document", select the correct category (this matters for compliance scoring), add a title and description, then upload the file. Your compliance score updates automatically.',
    category: 'compliance',
  },
  {
    question: 'How do I customize the community portal?',
    answer:
      'Admins can customize branding and portal settings from the Settings page. You can update your community logo, color scheme, and contact information that residents see.',
    category: 'admin',
  },
];
