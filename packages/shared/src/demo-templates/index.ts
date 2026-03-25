import type { CommunityType } from '..';
import { condoPublicCivicGlass } from './condo-public-civic-glass';
import { condoPublicCoastalWelcome } from './condo-public-coastal-welcome';
import { condoMobileResidentBulletin } from './condo-mobile-resident-bulletin';
import { condoMobileConciergeSnapshot } from './condo-mobile-concierge-snapshot';
import { hoaPublicNeighborhoodHub } from './hoa-public-neighborhood-hub';
import { hoaPublicBoardTransparency } from './hoa-public-board-transparency';
import { hoaMobileCommunityPulse } from './hoa-mobile-community-pulse';
import { hoaMobileBoardBrief } from './hoa-mobile-board-brief';
import { apartmentPublicResidentServices } from './apartment-public-resident-services';
import { apartmentPublicMaintenanceFirst } from './apartment-public-maintenance-first';
import { apartmentMobileTenantEssentials } from './apartment-mobile-tenant-essentials';
import { apartmentMobileServiceSnapshot } from './apartment-mobile-service-snapshot';
import type { DemoTemplateDefinition, DemoTemplateId, TemplateVariant } from './types';
import { DEMO_TEMPLATE_IDS } from './types';

export * from './types';

/** All registered demo templates. */
export const ALL_TEMPLATES: DemoTemplateDefinition[] = [
  condoPublicCivicGlass,
  condoPublicCoastalWelcome,
  condoMobileResidentBulletin,
  condoMobileConciergeSnapshot,
  hoaPublicNeighborhoodHub,
  hoaPublicBoardTransparency,
  hoaMobileCommunityPulse,
  hoaMobileBoardBrief,
  apartmentPublicResidentServices,
  apartmentPublicMaintenanceFirst,
  apartmentMobileTenantEssentials,
  apartmentMobileServiceSnapshot,
];

/**
 * Returns all templates for the given community type, optionally filtered by variant.
 */
export function getDemoTemplates(
  communityType: CommunityType,
  variant?: TemplateVariant,
): DemoTemplateDefinition[] {
  return ALL_TEMPLATES.filter(
    (t) =>
      t.communityType === communityType &&
      (variant === undefined || t.variant === variant),
  );
}

/**
 * Returns the first matching template for the given community type and optional variant,
 * or `undefined` if none exist.
 */
export function getDefaultTemplate(
  communityType: CommunityType,
  variant?: TemplateVariant,
): DemoTemplateDefinition | undefined {
  return getDemoTemplates(communityType, variant)[0];
}

/**
 * Looks up a template by its ID. Returns `undefined` if not found.
 */
export function getTemplateById(id: DemoTemplateId): DemoTemplateDefinition | undefined {
  return ALL_TEMPLATES.find((t) => t.id === id);
}

/**
 * Type guard — returns `true` if `value` is a known `DemoTemplateId`.
 */
export function isDemoTemplateId(value: unknown): value is DemoTemplateId {
  return typeof value === 'string' && (DEMO_TEMPLATE_IDS as readonly string[]).includes(value);
}
