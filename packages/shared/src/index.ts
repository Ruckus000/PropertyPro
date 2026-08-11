/**
 * Shared types and constants for PropertyPro Florida
 *
 * Role model (v3 / ADR-006):
 * - COMMUNITY_ROLES: the 3 community-scoped roles stored in `user_roles`
 *   (`resident` / `property_manager` / `root_manager`). `resident.isUnitOwner`
 *   distinguishes owner vs. tenant; board status is an orthogonal `designation`.
 * - platform_admin is system-scoped (not in user_roles).
 * - One active role per (user_id, community_id); ≤1 root_manager per community.
 *
 * The legacy 7-role vocabulary (owner/tenant/board_member/board_president/cam/
 * site_manager/property_manager_admin) was retired in the role-v3 collapse; this
 * type now speaks the single v3 vocabulary end-to-end.
 */

export const COMMUNITY_TYPES = ["condo_718", "hoa_720", "apartment"] as const;
export type CommunityType = (typeof COMMUNITY_TYPES)[number];

/** Human-readable display names for each community type. */
export const COMMUNITY_TYPE_DISPLAY_NAMES: Record<CommunityType, string> = {
  condo_718: 'Condo §718',
  hoa_720: 'HOA §720',
  apartment: 'Apartment',
};

/**
 * Community-scoped roles (v3 / ADR-006). The single role vocabulary:
 * `resident` (owner vs. tenant via `isUnitOwner`), `property_manager`, and
 * `root_manager` (≤1 per community). Board status is an orthogonal `designation`,
 * never a role. platform_admin is system-scoped (not in user_roles).
 */
export const COMMUNITY_ROLES = [
  "resident",
  "property_manager",
  "root_manager",
] as const;
export type CommunityRole = (typeof COMMUNITY_ROLES)[number];

/**
 * Convert a full name to initials (e.g., "John Doe" → "JD").
 * Returns "?" if name is null/empty.
 */
export function toInitials(name: string | null): string {
  if (!name || !name.trim()) return '?';
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export * from './branding';
export * from './compliance/templates';
export * from './compliance/posting-deadline';
export * from './access-policies';
export * from './default-document-categories';
export * from './rbac-matrix';
export * from './features';
export * from './plans';
export * from './ledger';
export * from './payables';
export * from './payment-fees';
export * from './middleware/reserved-subdomains';
export * from './middleware/subdomain-router';
export * from './validators';
export * from './esign-constants';
export * from './default-faqs';
export * from './role-transition';

// PR #1a — Property Landing Page block schemas (Zod-based)
// The old flat file at './site-blocks.ts' still exports validateBlockContent
// and getDefaultBlockContent; those are no longer publicly exported here.
// The flat file itself is retired in PR #9.
export {
  BLOCK_TYPES,
  blockTypeSchema,
  TOMBSTONE_BLOCK_TYPE,
  BLOCK_VARIANTS,
  blockVariantSchema,
  blockSchemaRegistry,
  heroBlockSchema,
  heroPhotoSchema,
  MAX_HERO_PHOTOS,
  resolveHeroPhotos,
  stripVariantSuffix,
  textBlockSchema,
  imageBlockSchema,
  documentsBlockSchema,
  meetingsBlockSchema,
  announcementsBlockSchema,
  contactBlockSchema,
  faqBlockSchema,
  galleryBlockSchema,
  amenitiesBlockSchema,
  paymentsBlockSchema,
  DOCUMENT_CATEGORIES,
} from './site-blocks/index';
export type {
  BlockType,
  BlockVariant,
  DocumentCategory,
  HeroBlockContent,
  HeroPhoto,
  ResolvedHeroPhoto,
  TextBlockContent,
  ImageBlockContent,
  DocumentsBlockContent,
  MeetingsBlockContent,
  AnnouncementsBlockContent,
  ContactBlockContent,
  FaqBlockContent,
  FaqItem,
  GalleryBlockContent,
  GalleryImage,
  AmenitiesBlockContent,
  AmenityItem,
  PaymentsBlockContent,
} from './site-blocks/index';
export {
  starterPackBlocksSchema,
  validateStarterPackBlocks,
  type StarterPackBlock,
  type StarterPackFieldError,
  type ValidateStarterPackBlocksResult,
} from './site-blocks/index';
// Preserve URL safety helpers from the old flat file — they remain useful
// generic utilities even after the rest of site-blocks.ts is retired.
export { isSafeUrl, isSafeImageUrl } from './site-blocks';
export * from './demo-templates';
export * from './demo-content-strategies';
export * from './reauth';
export * from './support-access';
export * from './public-site-url';
export * from './demo/lifecycle';
export * from './constants/subscription-statuses';
export * from './constants/cancellation-reasons';
export * from './auth/password-policy';
export * from './billing/permissions';
export * from './billing/stripe-mode';
export * from './billing/signup-trial';
export * from './billing/subscription-lifecycle';
export * from './billing/paid-grace';
export * from './billing/format-billing-date';
export * from './site/custom-domain';
export * from './site/portfolio-template-branding';

// The site change model (website editor v3, Phase 4). Shared rather than
// editor-local because publish-time validation has to run server-side too —
// a gate that exists only in the client is a suggestion.
export * from './site-diff/index';

// NOTE: the HTTP error hierarchy and Sentry request-context helper are NOT
// re-exported here. They live behind the `@propertypro/shared/http` subpath on
// purpose — see packages/shared/src/http/index.ts for why putting them in this
// barrel breaks 31 web test files that mock it with bare factories.
