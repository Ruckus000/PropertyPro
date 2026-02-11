/**
 * Schema barrel export — all tables, enums, and inferred types.
 */
export * from './enums';
export * from './communities';
export * from './users';
export * from './user-roles';
export * from './units';
export * from './document-categories';
export * from './documents';
export * from './notification-preferences';
export * from './compliance-audit-log';

// ---------------------------------------------------------------------------
// Inferred TypeScript types via Drizzle $inferSelect / $inferInsert
// ---------------------------------------------------------------------------
import type { communities } from './communities';
import type { users } from './users';
import type { userRoles } from './user-roles';
import type { units } from './units';
import type { documentCategories } from './document-categories';
import type { documents } from './documents';
import type { notificationPreferences } from './notification-preferences';
import type { complianceAuditLog } from './compliance-audit-log';

// Communities
export type Community = typeof communities.$inferSelect;
export type NewCommunity = typeof communities.$inferInsert;

// Users
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// User Roles
export type UserRoleRecord = typeof userRoles.$inferSelect;
export type NewUserRoleRecord = typeof userRoles.$inferInsert;

// Units
export type Unit = typeof units.$inferSelect;
export type NewUnit = typeof units.$inferInsert;

// Document Categories
export type DocumentCategory = typeof documentCategories.$inferSelect;
export type NewDocumentCategory = typeof documentCategories.$inferInsert;

// Documents
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;

// Notification Preferences
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert;

// Compliance Audit Log (append-only — no Insert type needed, use logAuditEvent())
export type ComplianceAuditLogRecord = typeof complianceAuditLog.$inferSelect;
