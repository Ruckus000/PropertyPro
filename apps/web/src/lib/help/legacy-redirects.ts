/**
 * Old help URLs → the reader's article in the section-based corpus.
 *
 * The pre-2026-09 corpus had one article per task with globally unique slugs
 * (`/help/documents/uploading-documents`). Bookmarks, emails and old
 * `?help=` deep links still point there, so `/help/<old-category>/<old-slug>`
 * redirects to the reader's version of the replacement. Where the old
 * article's replacement differs by readership (a manager uploads documents, a
 * resident finds them), the entry is per section.
 */
import type { HelpSection } from '@/lib/help/sections';

type LegacyTarget = string | Partial<Record<HelpSection, string>> & { default: string };

export const LEGACY_HELP_SLUGS: Readonly<Record<string, LegacyTarget>> = {
  'exporting-your-data': 'export-data',
  'managing-notifications': 'notifications',
  'password-and-security': 'profile-password',
  'requesting-account-deletion': 'delete-account',
  'updating-your-profile': 'profile-password',
  'creating-and-publishing-announcements': { manager: 'post-announcement', default: 'read-announcements' },
  'reading-and-managing-announcements': { manager: 'post-announcement', default: 'read-announcements' },
  'logging-packages': { manager: 'packages', default: 'packages-visitors' },
  'logging-visitors': { manager: 'visitors', default: 'packages-visitors' },
  'managing-leases': 'managing-leases',
  'managing-units-and-buildings': 'units',
  'move-in-move-out-checklists': 'move-in-out',
  'reviewing-the-audit-trail': 'audit-trail',
  'compliance-scoring-explained': 'compliance-score',
  'document-posting-requirements': 'posting-requirements',
  'fixing-compliance-gaps': 'fix-compliance-gaps',
  'reviewing-the-compliance-dashboard': 'compliance-dashboard',
  'understanding-sirs-inspections': 'sirs',
  'tracking-vendor-contracts': 'contracts',
  'finding-community-documents': 'find-documents',
  'organizing-the-document-library': { manager: 'organize-library', default: 'find-documents' },
  'searching-and-filtering-documents': 'find-documents',
  'uploading-documents': { manager: 'upload-document', default: 'find-documents' },
  'running-a-board-election': { resident: 'cast-ballot', default: 'run-election' },
  'using-board-polls': { manager: 'create-poll', default: 'vote-poll' },
  'sending-an-emergency-broadcast': { manager: 'emergency-broadcast', default: 'emergency-alerts' },
  'creating-an-esign-template': { manager: 'esign-template', default: 'sign-document' },
  'sending-an-esign-submission': { manager: 'send-for-signature', default: 'sign-document' },
  'signing-documents-electronically': { manager: 'send-for-signature', default: 'sign-document' },
  'creating-and-tracking-assessments': { manager: 'create-assessment', default: 'balance' },
  'paying-dues-and-assessments': { manager: 'create-assessment', default: 'pay-dues' },
  'setting-up-online-payments': { manager: 'online-payments', default: 'pay-dues' },
  'understanding-your-assessment-balance': { manager: 'create-assessment', default: 'balance' },
  'using-the-board-forum': 'board-forum',
  'joining-your-community': { manager: 'join-requests', default: 'join-community' },
  'managing-community-faqs': 'manage-faqs',
  'snowbird-digest': 'community-digest',
  'understanding-your-dashboard': 'your-dashboard',
  'using-the-mobile-app': 'getting-around',
  'welcome-to-propertypro': 'getting-around',
  'posting-your-master-policy': { manager: 'insurance-hub', default: 'insurance' },
  'requesting-an-insurance-certificate': { manager: 'insurance-hub', default: 'insurance' },
  'sharing-your-wind-mitigation-report': { manager: 'insurance-hub', default: 'insurance' },
  'using-the-wind-mitigation-report': { manager: 'insurance-hub', default: 'insurance' },
  'assigning-vendors-to-work-orders': { manager: 'dispatch-work-order', default: 'maintenance-request' },
  'submitting-a-maintenance-request': { manager: 'dispatch-work-order', default: 'maintenance-request' },
  'tracking-maintenance-status': { manager: 'dispatch-work-order', default: 'track-request' },
  'creating-meeting-notices': { manager: 'schedule-meeting', default: 'meeting-notices' },
  'meeting-notices-explained': 'meeting-notices',
  'posting-meeting-minutes': { manager: 'post-minutes', default: 'meeting-notices' },
  'viewing-meetings-and-notices': 'meeting-notices',
  'adding-cams-and-board-admins': 'roles-access',
  'customizing-pm-branding': 'website-branding',
  'managing-multiple-communities': 'portfolio',
  'managing-pm-subscriptions-and-billing': 'billing',
  'onboarding-a-new-community': 'onboard-community',
  'running-portfolio-reports': 'portfolio-reports',
  'sending-bulk-announcements-and-documents': 'bulk-send',
  'using-the-reserve-register': 'reserve-register',
  'approving-join-requests': 'join-requests',
  'inviting-and-managing-residents': 'invite-residents',
  'reporting-storm-damage': 'storm-damage',
  'configuring-the-transparency-page': 'transparency-page',
  'arc-acc-submissions': { manager: 'arc-review', default: 'arc-request' },
  'reporting-and-managing-violations': { resident: 'report-violation', default: 'review-violations' },
  'responding-to-a-violation-notice': { manager: 'review-violations', default: 'violation-notice' },
};

/**
 * The replacement slug for an old article, in the reader's section. The old
 * category is ignored: old slugs were unique across the whole corpus.
 */
export function resolveLegacyHelpSlug(
  _category: string,
  slug: string,
  section: HelpSection,
): string | null {
  const target = LEGACY_HELP_SLUGS[slug];
  if (!target) return null;
  return typeof target === 'string' ? target : (target[section] ?? target.default);
}
