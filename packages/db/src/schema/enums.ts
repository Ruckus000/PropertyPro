/**
 * PostgreSQL enum definitions for PropertyPro.
 */
import { pgEnum } from 'drizzle-orm/pg-core';

/** Community type: Florida condo (§718), HOA (§720), or apartment */
export const communityTypeEnum = pgEnum('community_type', [
  'condo_718',
  'hoa_720',
  'apartment',
]);

/** User role within a community [AGENTS #2: roles are per-community, not global] */
export const userRoleEnum = pgEnum('user_role', [
  'admin',
  'manager',
  'auditor',
  'resident',
]);
