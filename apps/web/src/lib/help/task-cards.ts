import type { CommunityFeatures } from '@propertypro/shared';

export interface HelpTaskCard {
  id: string;
  title: string;
  description: string;
  href: string;
}

interface BuildHelpTaskCardsInput {
  communityId: number;
  hasFinance: boolean;
  hasMeetings: boolean;
  hasMaintenance: boolean;
  hasCompliance: boolean;
  isAdmin: boolean;
}

export function buildHelpTaskCards({
  communityId,
  hasFinance,
  hasMeetings,
  hasMaintenance,
  hasCompliance,
  isAdmin,
}: BuildHelpTaskCardsInput): HelpTaskCard[] {
  const cards: HelpTaskCard[] = [
    {
      id: 'documents',
      title: 'View Documents',
      description: 'Find bylaws, budgets, minutes, and other records.',
      href: `/communities/${communityId}/documents`,
    },
    {
      id: 'payments',
      title: 'Pay Dues',
      description: 'Review balances, payment methods, and recent activity.',
      href: `/communities/${communityId}/payments`,
    },
    {
      id: 'maintenance',
      title: 'Submit Maintenance Request',
      description: 'Report an issue and follow status updates.',
      href: `/maintenance/submit?communityId=${communityId}`,
    },
    {
      id: 'meetings',
      title: 'View Meetings',
      description: 'See upcoming meetings, notices, and posted materials.',
      href: `/communities/${communityId}/meetings`,
    },
    {
      id: 'settings',
      title: 'Update Settings',
      description: 'Manage notifications, account info, and preferences.',
      href: `/settings?communityId=${communityId}`,
    },
    {
      id: 'contact-management',
      title: 'Contact Management',
      description: 'View your community’s support contact information.',
      href: `/help/contact?communityId=${communityId}`,
    },
  ];

  const filtered = cards.filter((card) => {
    if (card.id === 'payments') return hasFinance;
    if (card.id === 'maintenance') return hasMaintenance;
    if (card.id === 'meetings') return hasMeetings;
    return true;
  });

  if (isAdmin && hasCompliance) {
    filtered.push({
      id: 'compliance',
      title: 'Review Compliance',
      description: 'See what is satisfied, overdue, or still missing.',
      href: `/communities/${communityId}/compliance`,
    });
  }

  if (isAdmin) {
    filtered.push({
      id: 'announcements',
      title: 'Post Announcement',
      description: 'Create and manage community-wide updates.',
      href: `/announcements?communityId=${communityId}`,
    });
  }

  return filtered;
}

export function buildHelpTaskCardsFromFeatures(
  communityId: number,
  features: CommunityFeatures,
  isAdmin: boolean,
): HelpTaskCard[] {
  return buildHelpTaskCards({
    communityId,
    hasFinance: features.hasFinance,
    hasMeetings: features.hasMeetings,
    hasMaintenance: features.hasMaintenanceRequests,
    hasCompliance: features.hasCompliance,
    isAdmin,
  });
}
