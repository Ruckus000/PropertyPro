import type { CommunityType } from '.';

export type ContentStrategyId =
  | 'compliance-heavy'
  | 'maintenance-focused'
  | 'transparency-forward'
  | 'communication-first';

export interface SeedHints {
  documentBias: 'compliance' | 'maintenance' | 'financial' | 'general';
  meetingDensity: 'low' | 'medium' | 'high';
  complianceScore: number;
  announcementTone: 'formal' | 'friendly' | 'urgent';
}

export interface ContentStrategy {
  id: ContentStrategyId;
  label: string;
  description: string;
  appliesTo: CommunityType[];
  seedHints: SeedHints;
}

export const CONTENT_STRATEGIES: ContentStrategy[] = [
  {
    id: 'compliance-heavy',
    label: 'Compliance',
    description: 'Emphasizes statutory compliance, document posting, and regulatory timeliness.',
    appliesTo: ['condo_718', 'hoa_720', 'apartment'],
    seedHints: {
      documentBias: 'compliance',
      meetingDensity: 'high',
      complianceScore: 92,
      announcementTone: 'formal',
    },
  },
  {
    id: 'maintenance-focused',
    label: 'Maintenance',
    description: 'Centers on property upkeep, work orders, and vendor coordination.',
    appliesTo: ['condo_718', 'hoa_720', 'apartment'],
    seedHints: {
      documentBias: 'maintenance',
      meetingDensity: 'medium',
      complianceScore: 78,
      announcementTone: 'friendly',
    },
  },
  {
    id: 'transparency-forward',
    label: 'Transparency',
    description: 'Highlights financial disclosures, budget summaries, and reserve fund visibility.',
    appliesTo: ['condo_718', 'hoa_720', 'apartment'],
    seedHints: {
      documentBias: 'financial',
      meetingDensity: 'high',
      complianceScore: 85,
      announcementTone: 'formal',
    },
  },
  {
    id: 'communication-first',
    label: 'Communication',
    description: 'Focuses on resident engagement, announcements, and community updates.',
    appliesTo: ['condo_718', 'hoa_720', 'apartment'],
    seedHints: {
      documentBias: 'general',
      meetingDensity: 'medium',
      complianceScore: 80,
      announcementTone: 'friendly',
    },
  },
];

const DEFAULT_MAP: Record<CommunityType, ContentStrategyId> = {
  condo_718: 'compliance-heavy',
  hoa_720: 'transparency-forward',
  apartment: 'maintenance-focused',
};

export function getContentStrategies(communityType: CommunityType): ContentStrategy[] {
  return CONTENT_STRATEGIES.filter((s) => s.appliesTo.includes(communityType));
}

export function getDefaultStrategy(communityType: CommunityType): ContentStrategy {
  const id = DEFAULT_MAP[communityType];
  return CONTENT_STRATEGIES.find((s) => s.id === id) ?? (CONTENT_STRATEGIES[0] as ContentStrategy);
}

export function getStrategyById(id: string): ContentStrategy | undefined {
  return CONTENT_STRATEGIES.find((s) => s.id === id);
}
