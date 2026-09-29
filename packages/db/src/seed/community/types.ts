/** Public seed configuration/result types and the internal shapes shared between seed modules. */
import type { BoardDesignation, CommunityBranding, SeedHints } from '@propertypro/shared';

export interface SeedCommunityConfig {
  name: string;
  slug: string;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
  timezone?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  addressLine1?: string;
  branding?: CommunityBranding;
  isDemo?: boolean;
  trialEndsAt?: Date;
  demoExpiresAt?: Date;
  seedHints?: SeedHints;
}

export interface SeedUserConfig {
  email: string;
  fullName: string;
  phone?: string;
  /** v3 seed input vocabulary — 'owner'/'tenant' resolve to resident; 'property_manager' is the uniform manager role. */
  role: 'owner' | 'tenant' | 'property_manager';
  /** Optional board marker (role-v3 §3.2). BOARD_DESIGNATIONS[0]=president, [1]=member. */
  designation?: BoardDesignation;
}

export interface SeedCommunityResult {
  communityId: number;
  users: Array<{ email: string; userId: string; role: string }>;
}

export type SeedRole = SeedUserConfig['role'];

export type WizardType = 'condo' | 'apartment';

export type DemoDocumentCategoryKey =
  | 'declaration'
  | 'rules'
  | 'inspection_reports'
  | 'meeting_minutes'
  | 'announcements'
  | 'maintenance_records'
  | 'lease_docs'
  | 'community_handbook'
  | 'move_in_out_docs';

export type SeededDocumentCategoryIds = Record<DemoDocumentCategoryKey, number | undefined>;

export interface SeededDocument {
  id: number;
  attachToMeeting: boolean;
}
