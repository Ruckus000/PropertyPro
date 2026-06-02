/**
 * Canonical default document-category sets, one per community type.
 *
 * Single source of truth shared by demo seeding (packages/db/src/seed) and
 * production provisioning (apps/web create-community / provisioning-service) so
 * the two cannot drift. Every name normalizes to a KNOWN_DOCUMENT_CATEGORY_KEY
 * via `normalizeCategoryName()` in access-policies.ts, and the apartment set's
 * resident-facing categories (Rules, Community Handbook, Move In/Out Docs) match
 * the keys the apartment access policy already grants to tenants.
 */
import type { CommunityType } from './index';

export interface DefaultDocumentCategory {
  name: string;
  description: string;
}

/** Condo (§718) and HOA (§720) communities. */
const CONDO_HOA_DOCUMENT_CATEGORIES: readonly DefaultDocumentCategory[] = [
  { name: 'Governing Documents', description: 'Articles, bylaws, declarations, and rules' },
  { name: 'Financial Records', description: 'Budgets, financial reports, and audits' },
  { name: 'Meeting Records', description: 'Notices, agendas, and minutes' },
  { name: 'Correspondence', description: 'Official letters and notices' },
  { name: 'Contracts', description: 'Vendor and service contracts' },
  { name: 'Inspection Reports', description: 'Milestone inspections, SIRS, and structural reports' },
  { name: 'Insurance', description: 'Certificates of coverage and policies' },
  { name: 'Elections', description: 'Candidate materials, ballots, and election results' },
] as const;

/** Apartment communities. */
const APARTMENT_DOCUMENT_CATEGORIES: readonly DefaultDocumentCategory[] = [
  { name: 'Lease Agreements', description: 'Signed lease agreements and addenda' },
  { name: 'Maintenance Records', description: 'Work orders and inspection reports' },
  { name: 'Communications', description: 'Tenant notices and correspondence' },
  { name: 'Financials', description: 'Rent rolls and financial summaries' },
  { name: 'Compliance', description: 'Inspections, certifications, and permits' },
  { name: 'Rules', description: 'Community rules and policy updates' },
  { name: 'Community Handbook', description: 'Resident handbook and onboarding materials' },
  { name: 'Move In/Out Docs', description: 'Move-in and move-out instructions and forms' },
] as const;

/** Default document categories provisioned for a new community of the given type. */
export function getDefaultDocumentCategories(
  communityType: CommunityType,
): readonly DefaultDocumentCategory[] {
  return communityType === 'apartment'
    ? APARTMENT_DOCUMENT_CATEGORIES
    : CONDO_HOA_DOCUMENT_CATEGORIES;
}
