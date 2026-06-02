/**
 * Document category constants — extracted to avoid circular imports
 * between access-policies.ts and manager-permissions.ts.
 */

export const KNOWN_DOCUMENT_CATEGORY_KEYS = [
  'declaration',
  'rules',
  'inspection_reports',
  'meeting_minutes',
  'announcements',
  'maintenance_records',
  'lease_docs',
  'community_handbook',
  'move_in_out_docs',
  'financial_records',
  'contracts',
] as const;

export const DOCUMENT_CATEGORY_KEYS = [
  ...KNOWN_DOCUMENT_CATEGORY_KEYS,
  'unknown',
] as const;

export type KnownDocumentCategoryKey = (typeof KNOWN_DOCUMENT_CATEGORY_KEYS)[number];
export type DocumentCategoryKey = (typeof DOCUMENT_CATEGORY_KEYS)[number];
