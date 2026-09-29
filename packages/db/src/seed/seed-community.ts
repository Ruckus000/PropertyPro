/**
 * Public entry for the community seed (`@propertypro/db/seed/seed-community`).
 *
 * The implementation lives in `./community/`, one module per seed domain
 * (roadmap 3.10 / INF-03). This file only re-exports, so every importer —
 * scripts/seed-demo.ts, apps/admin's demos route, the seed tests — keeps its
 * path. Behaviour is pinned by
 * packages/db/__tests__/seed-community-counts.integration.test.ts.
 */
export type {
  DemoDocumentCategoryKey,
  SeedCommunityConfig,
  SeedCommunityResult,
  SeededDocumentCategoryIds,
  SeedUserConfig,
} from './community/types';
export { ensureSeededDocumentStorage, SEED_DOCUMENTS_BUCKET } from './community/storage';
export {
  getDefaultPassword,
  reconcilePublicUserIdWithAuthId,
  type ReconcilePublicUserProfile,
} from './community/users';
export { ensureNotificationPreference, seedRoles } from './community/roles';
export { seedDocumentCategories } from './community/documents';
export { linkSeededResidentUnits } from './community/units';
export { seedCommunity } from './community/seed';
